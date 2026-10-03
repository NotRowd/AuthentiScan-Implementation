import React, { useState, useCallback } from 'react';
import {
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import GlassCard from '../../components/ui/GlassCard';
import CyberButton from '../../components/ui/CyberButton';
import CyberText from '../../components/ui/CyberText';
import ScanGrid from '../../components/ui/ScanGrid';
import GlowEffect from '../../components/ui/GlowEffect';
import { VerdictChip } from '../../components/ui/StatusChip';
import Colors from '../../constants/Colors';
import Spacing from '../../constants/Spacing';
import { useAuth } from '../../hooks/useAuth';
import { scanHistoryService } from '../../services/scan/scanHistoryService';
import type { ScanResult } from '../../types';
import { OFFLINE_MODE } from '../../services/api/config';

/**
 * Dashboard Screen
 *
 * The user's detection control center.
 * - Welcome header with user info
 * - Primary "Detect Image" CTA
 * - Recent scan history cards
 * - Quick stats
 *
 * Backend mode loads a recent page and independent server totals; offline mode uses local samples.
 */
export default function DashboardScreen() {
  const { user, logout } = useAuth();

  const [scans, setScans] = useState<ScanResult[]>([]);
  const [historyError, setHistoryError] = useState(false);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof scanHistoryService.getStats>> | null>(null);
  useFocusEffect(useCallback(() => {
    let active = true;
    setScans([]); setStats(null); setHistoryError(false);
    Promise.all([scanHistoryService.getPage(0, 3), scanHistoryService.getStats()]).then(([page, summary]) => {
      if (active) { setScans(page.scans); setStats(summary); }
    }).catch(() => { if (active) setHistoryError(true); });
    return () => { active = false; };
  }, [user?.email]));
  const recentScans = scans.slice(0, 3);

  const handleLogout = async () => {
    await logout();
    router.replace('/(public)/home');
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#05070D', '#0B0F1A', '#080C14']}
        locations={[0, 0.6, 1]}
        style={StyleSheet.absoluteFill}
      />
      <ScanGrid animated />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Header ──────────────────────────────────────── */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <CyberText variant="label" color={Colors.textSecondary}>
                WELCOME BACK
              </CyberText>
              <CyberText variant="h4" numberOfLines={1}>
                {user?.name ?? 'Agent'}
              </CyberText>
            </View>
            <TouchableOpacity
              onPress={handleLogout}
              style={styles.logoutButton}
              accessibilityRole="button"
              accessibilityLabel="Sign out"
            >
              <Ionicons name="log-out-outline" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* ── Hero CTA ─────────────────────────────────────── */}
          <GlassCard variant="strong" style={styles.heroCard} active>
            <View style={styles.heroCardContent}>
              <GlowEffect color={Colors.cyan} intensity="medium" pulse>
                <View style={styles.scanIconContainer}>
                  <Ionicons name="scan-outline" size={40} color={Colors.cyan} />
                </View>
              </GlowEffect>

              <View style={styles.heroText}>
                <CyberText variant="h4">Detect an Image</CyberText>
                <CyberText variant="bodySmall">
                  {OFFLINE_MODE ? 'Preview offline classification samples' : 'Upload an image for AI classification'}
                </CyberText>
              </View>
            </View>

            <CyberButton
              label="Start Scanning"
              onPress={() => router.push('/(tabs)/scan')}
              variant="primary"
              size="lg"
              style={styles.heroButton}
              icon={<Ionicons name="scan-outline" size={20} color={Colors.bgPrimary} />}
            />
          </GlassCard>

          {/* ── Quick stats ───────────────────────────────────── */}
          <View style={styles.statsRow}>
            {[
              {
                label: 'TOTAL SCANS',
                value: historyError || !stats ? '--' : stats.total_scans.toString(),
                icon: 'analytics-outline' as const,
              },
              {
                label: 'AI-GENERATED',
                value: historyError || !stats ? '--' : stats.ai_generated_found.toString(),
                icon: 'warning-outline' as const,
                color: Colors.fake,
              },
              {
                label: 'REMAINING',
                value: historyError || !stats ? '--' : !stats.plan ? 'No plan' : stats.scans_remaining === null ? 'Unlimited' : stats.scans_remaining.toString(),
                icon: 'shield-checkmark-outline' as const,
                color: Colors.authentic,
              },
            ].map((stat) => (
              <GlassCard key={stat.label} style={styles.statCard}>
                <Ionicons
                  name={stat.icon}
                  size={20}
                  color={stat.color ?? Colors.cyan}
                />
                <CyberText
                  variant="h3"
                  color={stat.color ?? Colors.textPrimary}
                  align="center"
                >
                  {stat.value}
                </CyberText>
                <CyberText variant="caption" align="center">
                  {stat.label}
                </CyberText>
              </GlassCard>
            ))}
          </View>

          {/* ── Recent scans ──────────────────────────────────── */}
          <View style={styles.recentSection}>
            <View style={styles.sectionHeader}>
              <CyberText variant="label">RECENT SCANS</CyberText>
              <TouchableOpacity
                onPress={() => router.push('/(tabs)/history')}
                accessibilityRole="button"
                accessibilityLabel="View all scans"
              >
                <CyberText variant="caption" color={Colors.cyan}>
                  VIEW ALL
                </CyberText>
              </TouchableOpacity>
            </View>

            {recentScans.length === 0 ? (
              <GlassCard style={styles.emptyCard}>
                <Ionicons name="scan-outline" size={32} color={Colors.textMuted} />
                <CyberText variant="body" muted align="center">
                  {historyError ? 'Unable to load account data. Reopen this tab to retry.' : !stats ? 'Loading account data…' : 'No scans yet. Scan your first image!'}
                </CyberText>
              </GlassCard>
            ) : (
              <View style={styles.scansList}>
                {recentScans.map((scan) => (
                  <GlassCard key={scan.id} style={styles.scanCard}>
                    {/* Scan image placeholder */}
                    <View style={styles.scanThumbnail}>
                      <Ionicons
                        name="image-outline"
                        size={24}
                        color={Colors.textMuted}
                      />
                    </View>

                    {/* Scan info */}
                    <View style={styles.scanInfo}>
                      {scan.hasAnalysis ? <VerdictChip verdict={scan.verdict} /> : <CyberText variant="label">{scan.status.toUpperCase()}</CyberText>}
                      <CyberText variant="caption">
                        {formatDate(scan.scannedAt)}
                      </CyberText>
                    </View>

                    {/* Confidence */}
                    <View style={styles.scanConfidence}>
                      <CyberText
                        variant="body"
                        color={
                          scan.verdict === 'ai_generated'
                            ? Colors.fake
                            : scan.verdict === 'authentic'
                              ? Colors.authentic
                              : Colors.textSecondary
                        }
                        style={styles.confidenceValue}
                      >
                        {scan.hasAnalysis ? scan.confidence + '%' : '--'}
                      </CyberText>
                      <CyberText variant="caption">confidence</CyberText>
                    </View>
                  </GlassCard>
                ))}
              </View>
            )}
          </View>

          {/* Bottom padding for tab bar */}
          <View style={{ height: Spacing.tabBarHeight + 16 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.screenPadding,
    paddingBottom: 16,
  },
  // ── Header ──────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    paddingBottom: 20,
  },
  headerLeft: {
    gap: 2,
  },
  logoutButton: {
    padding: 8,
  },
  // ── Hero CTA ─────────────────────────────────────────
  heroCard: {
    gap: 20,
    marginBottom: 16,
  },
  heroCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  scanIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: Colors.cyanDim,
    borderWidth: 1,
    borderColor: Colors.glassBorderCyan,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: {
    flex: 1,
    gap: 4,
  },
  heroButton: {},
  // ── Stats ─────────────────────────────────────────────
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  // ── Recent scans ──────────────────────────────────────
  recentSection: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  emptyCard: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 32,
  },
  scansList: {
    gap: 10,
  },
  scanCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
  },
  scanThumbnail: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: Colors.bgTertiary,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanInfo: {
    flex: 1,
    gap: 6,
  },
  scanConfidence: {
    alignItems: 'flex-end',
    gap: 2,
  },
  confidenceValue: {
    fontWeight: '700',
    fontSize: 18,
  },
});
