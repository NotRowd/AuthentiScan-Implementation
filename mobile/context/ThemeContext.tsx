import React,{createContext,useContext,useEffect,useRef,useState,useMemo} from 'react';
import {ActivityIndicator,useColorScheme,View} from 'react-native';
import {StatusBar} from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {LightColors,DarkColors,type ColorPalette} from '../constants/Colors';
export type ThemePreference='light'|'dark'|'system';
export const THEME_KEY='authentiscan.appearance.v1';
export function validPreference(value:unknown):value is ThemePreference{return value==='light'||value==='dark'||value==='system';}
export function resolveTheme(preference:ThemePreference,system:string|null|undefined){return preference==='system'?(system==='dark'?'dark':'light'):preference;}
type ThemeValue={colors:ColorPalette;preference:ThemePreference;isDark:boolean;setPreference:(value:ThemePreference)=>void;saveError:string};
const Context=createContext<ThemeValue|null>(null);
export function ThemeProvider({children}:{children:React.ReactNode}){
 const system=useColorScheme();const [preference,setChoice]=useState<ThemePreference>('system'),[ready,setReady]=useState(false),[saveError,setError]=useState('');
 const writes=useRef<Promise<unknown>>(Promise.resolve()),revision=useRef(0);
 useEffect(()=>{let active=true;const initial=revision.current;AsyncStorage.getItem(THEME_KEY).then(value=>{if(active&&revision.current===initial&&validPreference(value))setChoice(value);}).catch(()=>{}).finally(()=>{if(active)setReady(true);});return()=>{active=false;};},[]);
 const isDark=resolveTheme(preference,system)==='dark';const colors=isDark?DarkColors:LightColors;
 const value=useMemo<ThemeValue>(()=>({colors,preference,isDark,saveError,setPreference(next){
  if(!validPreference(next))return;
  const version=++revision.current;setChoice(next);setError('');
  writes.current=writes.current.catch(()=>{}).then(()=>AsyncStorage.setItem(THEME_KEY,next)).catch(()=>{if(revision.current===version)setError('Theme changed for this session. Could not save it on this device. Tap your choice to retry.');});
 }}),[colors,preference,isDark,saveError]);
 return <Context.Provider value={value}>{ready?children:<View style={{flex:1,justifyContent:'center',backgroundColor:colors.bgPrimary}}><StatusBar style={isDark?'light':'dark'}/><ActivityIndicator accessibilityLabel="Loading appearance" color={colors.cyan}/></View>}</Context.Provider>;
}
export function useTheme(){const value=useContext(Context);if(!value)throw new Error('ThemeProvider is required');return value;}
export function useThemedStyles<T>(factory:(colors:ColorPalette)=>T){const {colors}=useTheme();return useMemo(()=>factory(colors),[colors,factory]);}
