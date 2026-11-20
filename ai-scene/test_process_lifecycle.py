import ctypes
import os
import socket
import subprocess
import sys
import threading
import unittest
from process_lifecycle import watch_parent_pipe


class LifecycleTests(unittest.TestCase):
    def test_occupied_service_port_fails_cleanly_without_touching_owner(self):
        with socket.socket() as owner:
            owner.bind(('127.0.0.1', 0)); owner.listen()
            process = subprocess.Popen([sys.executable, '-u', 'qwen_service.py', '--parent-pipe',
                                        '--port', str(owner.getsockname()[1])], stdin=subprocess.PIPE,
                                       stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            try:
                self.assertEqual(process.wait(timeout=10), 1)
                self.assertIn(b'No existing process was stopped', process.stdout.read())
                self.assertEqual(process.stderr.read(), b'')
                with socket.create_connection(owner.getsockname(), timeout=1):
                    pass
            finally:
                if process.poll() is None: process.kill(); process.wait()
                process.stdin.close(); process.stdout.close(); process.stderr.close()

    def test_parent_pipe_eof_sets_stop(self):
        read, write = os.pipe()
        stop = threading.Event()
        thread = watch_parent_pipe(stop, read)
        try:
            self.assertFalse(stop.is_set())
            os.close(write)
            self.assertTrue(stop.wait(2))
            thread.join(2)
            self.assertFalse(thread.is_alive())
        finally:
            os.close(read)

    def test_startup_failure_with_open_pipe_has_no_buffered_reader_crash(self):
        script = 'import threading; from process_lifecycle import watch_parent_pipe; watch_parent_pipe(threading.Event()); raise SystemExit(1)'
        process = subprocess.Popen([sys.executable, '-c', script], stdin=subprocess.PIPE,
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            # Keep stdin OPEN while Python exits: reproduces the original shutdown bug.
            self.assertEqual(process.wait(timeout=10), 1)
            self.assertNotIn(b'_enter_buffered_busy', process.stderr.read())
        finally:
            if process.poll() is None:
                process.kill()
                process.wait()
            process.stdin.close(); process.stdout.close(); process.stderr.close()

    @unittest.skipUnless(os.name == 'nt', 'Windows job lifecycle')
    def test_job_cleans_child_after_normal_and_forced_adapter_exit(self):
        from ctypes import wintypes as w
        kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        kernel.OpenProcess.argtypes = [w.DWORD, w.BOOL, w.DWORD]
        kernel.OpenProcess.restype = w.HANDLE
        kernel.WaitForSingleObject.argtypes = [w.HANDLE, w.DWORD]
        kernel.WaitForSingleObject.restype = w.DWORD
        kernel.CloseHandle.argtypes = [w.HANDLE]
        script = ('import os,subprocess,sys; from process_lifecycle import protect_process_tree; '
                  'protect_process_tree(); '
                  'child=subprocess.Popen([sys.executable,"-c","import time; time.sleep(60)"],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); '
                  'print(child.pid,flush=True); os.read(0,1)')
        for forced in (False, True):
            with self.subTest(forced=forced):
                parent = subprocess.Popen([sys.executable, '-u', '-c', script], stdin=subprocess.PIPE,
                                          stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                handle = None
                try:
                    line = parent.stdout.readline().strip()
                    self.assertTrue(line.isdigit(), 'Job setup must succeed before creating its child')
                    handle = kernel.OpenProcess(0x100000, False, int(line))  # SYNCHRONIZE
                    self.assertTrue(handle)
                    if forced:
                        parent.kill()
                    else:
                        parent.stdin.close()
                    parent.wait(timeout=10)
                    self.assertEqual(kernel.WaitForSingleObject(handle, 5000), 0, 'Owned model must exit with adapter')
                finally:
                    if parent.poll() is None:
                        parent.kill(); parent.wait()
                    if handle: kernel.CloseHandle(handle)
                    parent.stdin.close(); parent.stdout.close(); parent.stderr.close()


if __name__ == '__main__':
    unittest.main()
