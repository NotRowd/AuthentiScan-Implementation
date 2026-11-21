import React,{createContext,useContext,useEffect,useRef,useState,useMemo} from 'react';
import {ActivityIndicator,Appearance,View} from 'react-native';
import {StatusBar} from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {LightColors,DarkColors,type ColorPalette} from '../constants/Colors';
export type ThemePreference='light'|'dark';
export const THEME_KEY='authentiscan.appearance.v1';
export function validPreference(value:unknown):value is ThemePreference{return value==='light'||value==='dark';}
export function resolveTheme(preference:ThemePreference){return preference;}
type ThemeValue={colors:ColorPalette;preference:ThemePreference;isDark:boolean;setPreference:(value:ThemePreference)=>void;saveError:string};
const Context=createContext<ThemeValue|null>(null);
export function ThemeProvider({children}:{children:React.ReactNode}){
 const [preference,setChoice]=useState<ThemePreference>(()=>Appearance.getColorScheme()==='dark'?'dark':'light'),[ready,setReady]=useState(false),[saveError,setError]=useState('');
 const writes=useRef<Promise<unknown>>(Promise.resolve()),revision=useRef(0),initialTheme=useRef(preference);
 useEffect(()=>{let active=true;const initial=revision.current;
  AsyncStorage.getItem(THEME_KEY).then(async stored=>{if(!active||revision.current!==initial)return;const next=validPreference(stored)?stored:initialTheme.current;setChoice(next);if(!validPreference(stored)){try{await AsyncStorage.setItem(THEME_KEY,next);}catch(_){if(active)setError('Theme changed for this session. Could not save it on this device.');}}}).catch(()=>{if(active)setError('Could not restore your saved theme. Choose a theme to save it again.');}).finally(()=>{if(active)setReady(true);});return()=>{active=false;};
 },[]);
 const isDark=preference==='dark',colors=isDark?DarkColors:LightColors;
 const value=useMemo<ThemeValue>(()=>({colors,preference,isDark,saveError,setPreference(next){if(!validPreference(next))return;const version=++revision.current;setChoice(next);setError('');writes.current=writes.current.catch(()=>{}).then(()=>AsyncStorage.setItem(THEME_KEY,next)).catch(()=>{if(revision.current===version)setError('Theme changed for this session. Could not save it on this device.');});}}),[colors,preference,isDark,saveError]);
 return <Context.Provider value={value}>{ready?children:<View style={{flex:1,justifyContent:'center',backgroundColor:colors.bgPrimary}}><StatusBar style={isDark?'light':'dark'}/><ActivityIndicator accessibilityLabel="Loading appearance" color={colors.cyan}/></View>}</Context.Provider>;
}
export function useTheme(){const value=useContext(Context);if(!value)throw new Error('ThemeProvider is required');return value;}
export function useThemedStyles<T>(factory:(colors:ColorPalette)=>T){const {colors}=useTheme();return useMemo(()=>factory(colors),[colors,factory]);}
