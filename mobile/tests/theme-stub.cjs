const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),ts=require('typescript');
const moduleValue={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../constants/Colors.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:moduleValue,exports:moduleValue.exports});
const colors=moduleValue.exports.LightColors;
module.exports={ThemeProvider:'ThemeProvider',useTheme:()=>({colors,isDark:false,preference:'light',setPreference(){},saveError:''}),useThemedStyles:factory=>factory(colors)};
