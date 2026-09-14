# Planilha Manel para Android

Aplicativo Android instalável que abre a Planilha Manel no próprio aplicativo,
com a mesma interface e o mesmo banco de dados do site:
https://arbt-controle.aemonddesignmelhor.chatgpt.site/

## Uso

1. Baixe `Planilha-Manel.apk` no Android e abra o arquivo.
2. Caso o Android solicite, permita a instalação de aplicativos para o navegador
   ou gerenciador de arquivos usado. Depois da instalação, essa permissão pode ser desativada.
3. Abra **Planilha Manel** pelo ícone verde com a letra M.

É necessário Android 8.0 ou posterior, Android System WebView atualizado e internet.
Os lançamentos são feitos no mesmo site: não há cópia independente da banca no celular.
O aplicativo usa o acesso público já configurado para o site. Não solicita login do ChatGPT.
O acesso continua dependendo da disponibilidade e do endereço do site.

Contas por pessoa e casa, depósitos/saques, saldo por pessoa, arbitragens com várias
contas, divisão de apostas, mercados e combinações, finalização, freebets pendentes
e recebidas, perda anterior, resultado líquido e sincronização ficam disponíveis
na interface web atual. Atualizações futuras publicadas no site também aparecem no app.

O APK não contém um backup dos registros financeiros: os registros ficam no servidor.
O código deste diretório e o código do site estão salvos juntos no repositório do projeto.
Uma cópia do código permite manutenção, mas não substitui um backup do banco de dados.

## Preenchimento por voz

Abra Nova arbitragem → Preencher por voz → Começar a falar. Dite o evento e
o mercado, depois “aposta 1”, a casa e o titular, seleção, valor e odd. Repita
para as demais apostas; é possível continuar ditando em partes. Confira o texto,
toque em Preencher formulário para revisar, ajuste os campos sinalizados e salve.
A data usada é a que já aparece no formulário. Nenhum comando salva automaticamente.

A versão 1.1.0 abre o reconhecedor de voz do Android com uma solicitação explícita
por toque. Requer um serviço de reconhecimento de fala instalado e habilitado.
O serviço do aparelho pode processar áudio online; o aplicativo recebe apenas texto.
No site, usa o reconhecimento de voz disponível no navegador. O microfone do teclado
pode ser usado como alternativa. Para ativar o reconhecimento direto no APK 1.0.0,
instale a versão 1.1.0 por cima, mantendo a mesma assinatura.

## Compilação

Versão atual: 1.1.0, código 2, pacote `br.com.planilhamanel.app`.
API mínima 26; API alvo e de compilação 35. Sem bibliotecas nativas, compatível com
as arquiteturas Android suportadas por essas versões.

Instale Java 17 ou posterior, Python 3, Android SDK Platform 35 e Build Tools 35.0.0.
Exemplo de compilação:

```bash
python3 android/build_apk.py \
  --build-tools /caminho/android-sdk/build-tools/35.0.0 \
  --android-jar /caminho/android-sdk/platforms/android-35/android.jar \
  --keystore /caminho/privado/manel-release.p12 \
  --password-file /caminho/privado/manel-release.password \
  --output /caminho/saida/Planilha-Manel.apk
```

A chave usa o alias `manel`. Guarde o backup de assinatura separadamente, em local
privado. A chave e a senha não devem ser adicionadas ao código nem publicadas no site.
Para atualizar um APK já instalado, preserve a chave e o nome do pacote, e aumente
`versionCode` e `versionName` no manifesto. Não gere outra chave para atualizar.

O build verifica assinatura e alinhamento do APK e imprime pacote, versão, API mínima
e hash SHA-256. Não há cache de registros locais nem interface JavaScript nativa.
A navegação no WebView é restrita ao domínio do projeto; links web externos abrem no navegador.
HTTPS é obrigatório. O único acesso solicitado ao Android é a internet.

Referências oficiais:
- https://developer.android.com/develop/ui/views/layout/webapps/webview
- https://developer.android.com/tools/apksigner
- https://developer.android.com/tools/zipalign

Referência de voz: https://developer.android.com/reference/android/speech/RecognizerIntent
