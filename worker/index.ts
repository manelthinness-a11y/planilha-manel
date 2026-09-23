// Entry Worker customizado. Delega o fetch pro handler padrão do vinext (App
// Router) e acrescenta um handler `scheduled`, chamado pelo Cron Trigger
// (ver "triggers" em wrangler.jsonc — todo dia às 12h de Brasília / 15h UTC)
// que dispara o resumo diário e os alertas automáticos do Telegram de saldo
// baixo, pendências esquecidas e freebet perto de vencer. Ver lib/alerts.ts.
// Os alertas ligados a eventos (arbitragem liquidada, Alavancagem, ODD5)
// continuam vindo das próprias rotas de API — não passam por aqui.
//
// Este arquivo é o que faz `main` deixar de apontar direto pra
// "vinext/server/fetch-handler" (que não tem como expor um `scheduled`) e
// passar a apontar pra cá. Precisa estar espelhado em dois lugares:
// wrangler.jsonc ("main") e vite.config.ts (localBindingConfig.main).
import handler from 'vinext/server/fetch-handler';
import {runDailyChecks} from '../lib/alerts';

export default {
 fetch:(request:Request,env:unknown,ctx:ExecutionContext)=>(handler as any).fetch(request,env,ctx),
 async scheduled(_event:ScheduledController,_env:unknown,ctx:ExecutionContext){
  ctx.waitUntil(runDailyChecks());
 },
} satisfies ExportedHandler;
