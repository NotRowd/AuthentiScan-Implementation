import {useWindowDimensions} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

export function mobileTabMetrics(bottom:number,fontScale:number){
 const inset=Math.max(0,bottom),scale=Math.max(1,fontScale||1);
 const labelHeight=Math.ceil(17*scale*(scale>1.25?2:1));
 // SDK tab items add 5px padding above AND below their pressable children.
 // Include that, the item top padding, icon, label gap and 4px breathing room.
 const itemHeight=4+10+48+2+labelHeight+4;
 const paddingBottom=8+inset;
 const height=1+4+itemHeight+paddingBottom; // border + bar top + item + safe area
 return {height,itemHeight,labelHeight,paddingBottom,contentBottom:height+20};
}
export function useMobileTabSpacing(){
 const {bottom}=useSafeAreaInsets(),{fontScale}=useWindowDimensions();
 return mobileTabMetrics(bottom,fontScale);
}
export function useDetailBottomPadding(minimum=48){
 return Math.max(minimum,useSafeAreaInsets().bottom+20);
}
