/** Shared semantic palette. Image/heatmap pixels are never transformed. */
export const LightColors = {
 bgPrimary:'#F6F9FC',bgSecondary:'#FFFFFF',bgTertiary:'#F0F5FA',
 cyan:'#006F95',cyanAlt:'#006F95',cyanDim:'#E8F7FD',cyanGlow:'rgba(0,111,149,0.12)',
 action:'#04749A',actionHover:'#035E7D',onAction:'#FFFFFF',focus:'#007DA8',
 fake:'#A42641',fakeDim:'#FFF0F3',fakeGlow:'rgba(164,38,65,0.12)',
 authentic:'#126447',authenticDim:'#E8F8F0',authenticGlow:'rgba(18,100,71,0.12)',
 ai:'#6B2DBD',aiDim:'#F3EDFD',warning:'#805000',warningDim:'#FFF5D9',
 textPrimary:'#10223C',textSecondary:'#435B72',textMuted:'#596D83',textInverse:'#FFFFFF',
 glassBg:'#FFFFFF',glassBgStrong:'#FFFFFF',glassBorder:'#DCE5EE',glassBorderCyan:'#798DA1',glassBorderStrong:'#798DA1',
 severityLow:'#126447',severityMedium:'#805000',severityHigh:'#A42641',
 white:'#FFFFFF',black:'#000000',transparent:'transparent',
 gridLine:'rgba(0,111,149,0.045)',scanLine:'rgba(0,111,149,0.20)',
 border:'#DCE5EE',borderActive:'#007DA8',control:'#798DA1',
 disabled:'#E2E9F0',disabledText:'#4D6278',surfaceHover:'#EAF2F8',
 logoPlate:'#EEF7FD',media:'#EDF2F6',overlay:'rgba(2,6,23,0.6)',shadow:'transparent',
} as const;
export type ColorPalette = {[K in keyof typeof LightColors]: string};
export const DarkColors: ColorPalette = {
 ...LightColors,
 bgPrimary:'#091321',bgSecondary:'#102237',bgTertiary:'#172D45',
 cyan:'#49D7FA',cyanAlt:'#49D7FA',cyanDim:'#12394C',cyanGlow:'rgba(73,215,250,0.10)',
 action:'#3BD0F3',actionHover:'#7DE2FB',onAction:'#082638',focus:'#82E8FF',
 fake:'#FFC0CC',fakeDim:'#40283A',fakeGlow:'rgba(255,192,204,0.10)',
 authentic:'#80E6C2',authenticDim:'#123A35',authenticGlow:'rgba(128,230,194,0.10)',
 ai:'#D7C1FF',aiDim:'#302C50',warning:'#F8D797',warningDim:'#3A3022',
 textPrimary:'#EFF6FF',textSecondary:'#C1D2E5',textMuted:'#A2B8CF',
 glassBg:'#102237',glassBgStrong:'#102237',glassBorder:'#2A425C',glassBorderCyan:'#7797B6',glassBorderStrong:'#7797B6',
 severityLow:'#80E6C2',severityMedium:'#F8D797',severityHigh:'#FFC0CC',
 gridLine:'rgba(73,215,250,0.045)',scanLine:'rgba(73,215,250,0.20)',
 border:'#2A425C',borderActive:'#82E8FF',control:'#7797B6',disabled:'#243B52',disabledText:'#B6CCE0',surfaceHover:'#1E3853',media:'#07111E',
};
export type ColorKey = keyof ColorPalette;
export default LightColors;
