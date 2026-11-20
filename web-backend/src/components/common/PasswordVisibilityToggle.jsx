import React from 'react';
import {Eye,EyeOff} from 'lucide-react';

export default function PasswordVisibilityToggle({visible,onToggle,inputId,label='password'}){
  const Icon=visible?EyeOff:Eye;
  return <button type="button" onClick={onToggle} aria-label={`${visible?'Hide':'Show'} ${label}`} aria-controls={inputId}
    className="absolute right-1 top-1/2 -translate-y-1/2 min-h-11 px-3 flex items-center gap-1.5 rounded-lg text-accent hover:bg-accent-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus">
    <Icon className="w-4 h-4" aria-hidden="true"/><span className="text-xs font-semibold">{visible?'Hide':'Show'}</span>
  </button>;
}
