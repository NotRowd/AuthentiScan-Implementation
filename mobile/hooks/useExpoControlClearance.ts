import Constants from 'expo-constants';
/** The floating gear belongs to Expo Go, never to the release app. */
export function useExpoControlClearance(){
 return __DEV__&&Constants.executionEnvironment==='storeClient'?64:0;
}
