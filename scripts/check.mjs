import ts from '../tools/typescript/lib/typescript.js';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
// `server/db/` e `api/` também contêm código do runtime: precisam ser verificados.
// `tests/support/` é helpers, também incluído.
const directories=['server','server/db','public','scripts','tests','tests/support','api'];
const files=directories.flatMap(dir=>{
  try { return readdirSync(dir).filter(f=>/\.(?:mjs|js)$/u.test(f)).map(f=>resolve(dir,f)); }
  catch { return []; }
});
let failures=0;
if(process.argv.includes('--types')) {
  const program=ts.createProgram(readdirSync('public').filter(file=>file.endsWith('.js')).map(file=>resolve('public',file)),{
    allowJs:true,checkJs:true,noEmit:true,target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.ESNext,
    lib:['lib.es2023.d.ts','lib.dom.d.ts','lib.dom.iterable.d.ts'],skipLibCheck:true,
    noUnusedLocals:true,noUnusedParameters:true,strict:false
  });
  const diagnostics=ts.getPreEmitDiagnostics(program);
  for(const diagnostic of diagnostics) {
    const at=diagnostic.file?.getLineAndCharacterOfPosition(diagnostic.start||0);
    console.error(`${diagnostic.file?.fileName||'TypeScript'}:${at?at.line+1:0}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText,' ')}`);failures++;
  }
  console.log(`TypeScript 6.0.3 · verificação estática de JavaScript: ${failures} erros.`);
} else {
  for(const file of files) {
    const source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.ES2023,true,ts.ScriptKind.JS);
    for(const diagnostic of source.parseDiagnostics) {console.error(`${file}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText,' ')}`);failures++;}
    function visit(node) {
      if(node.kind===ts.SyntaxKind.DebuggerStatement||(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&['eval','Function'].includes(node.expression.text))) {console.error(`${file}: execução dinâmica/debugger proibidos.`);failures++;}
      if(ts.isBinaryExpression(node)&&[ts.SyntaxKind.EqualsEqualsToken,ts.SyntaxKind.ExclamationEqualsToken].includes(node.operatorToken.kind)) {console.error(`${file}: use igualdade estrita.`);failures++;}
      ts.forEachChild(node,visit);
    }
    visit(source);
  }
  console.log(`Lint nativo (parser TypeScript, sintaxe e regras de segurança) · ${files.length} arquivos · ${failures} erros.`);
}
process.exitCode=failures?1:0;
