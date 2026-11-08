# yt-dlp GUI para Android

App de celular do yt-dlp GUI. A tela usa React, Tailwind e Capacitor e reaproveita do app de PC as traduções, as predefinições e as regras de imagem. O motor fica no Android:

- **yt-dlp, Python e ffmpeg:** vêm da biblioteca [youtubedl-android](https://github.com/JunkFood02/youtubedl-android).
- **IAs:** um motor nativo próprio, o `libaiengine.so`, com [ncnn](https://github.com/Tencent/ncnn) e Vulkan. Ele roda o RIFE v4.6 (quadros novos) e o Real-ESRGAN (realesr-animevideov3 2x).

## O que tem

- **Baixar:** cole um link, ou compartilhe de outro app (YouTube, TikTok, Instagram…) e escolha o yt-dlp GUI. Dá para pegar a Qualidade máxima, uma resolução ou só o áudio (MP3/M4A). "Preparar depois de baixar" já gera a versão para a rede escolhida.
- **Preparar:** um vídeo da galeria ou um já baixado.
  - Destinos prontos: TikTok, Reels, Shorts, feed, Quadrado e YouTube.
  - Tamanho e enquadramento: cortar com posição e zoom, fundo desfocado ou barras.
  - FPS, velocidade e trecho.
  - Nitidez, brilho, contraste e saturação.
  - Texto por cima do vídeo.
  - Qualidade, H.264 ou H.265, e som.
- **IAs baixadas só por quem quiser:**
  - RIFE: 10 MB, quadros novos, por exemplo de 30 para 60 fps.
  - Real-ESRGAN: 1,2 MB, dobra a resolução.
  - O motor vem no app; os modelos vêm da release [`ia-pacotes`](https://github.com/ArthurDaviAraujo/ytdlp-studio/releases/tag/ia-pacotes).
  - Precisam de uma placa com Vulkan. Sem ela, o app desliga a opção e mostra o motivo.
- **Downloads:** fila com progresso, cancelar, abrir, compartilhar e "Preparar". Os arquivos vão para `Download/yt-dlp GUI` e aparecem na galeria.
- **Ajustes:** idioma, atualizar o yt-dlp e IAs.
- **Versão nova:** ao abrir, o app consulta as releases `android-v*` do GitHub, no máximo a cada 6 h. Se houver uma mais nova, mostra um aviso com o botão "Baixar". O botão abre no navegador o APK certo para o celular (arm64 ou x86_64), e o Android instala por cima. Também dá para procurar em Ajustes → App. Para ver o aviso no navegador, use `APP_VERSION=0.9.0 npm run dev`.
- **Ícone e abertura:** os mesmos do app de PC. O ícone sai do `build/icon.svg` em todos os tamanhos do Android, incluindo o ícone adaptável, com o desenho sobre o degradê escuro.

## Testar a tela no navegador

```bash
npm install
npm run dev
```

No navegador, o lado Android é simulado, com dados de exemplo e progresso de mentira (`src/native.ts`). Isso serve para ver e ajustar a tela.

## Gerar o APK

O que precisa estar no PC:

- **Java 17 ou mais novo.**
- **Android SDK** em `D:\yt-dlp\android-sdk`, com `platform-tools`, `platforms;android-36`, `build-tools;35.0.0`, `ndk;30.0.16248370` e `cmake;3.31.6`. Ele é apontado pelo `android/local.properties` (`sdk.dir=D\:/yt-dlp/android-sdk`).
- **ncnn para Android com Vulkan:** o arquivo `ncnn-20261020-android-vulkan.zip` da [release do ncnn](https://github.com/Tencent/ncnn/releases/tag/20261020). As pastas `arm64-v8a` e `x86_64` dele vão para `android/app/src/main/cpp/ncnn/`. Ele fica fora do git porque tem 60 MB.

Depois:

```bash
npm run sync
cd android
./gradlew assembleRelease
```

Saem dois APKs em `android/app/build/outputs/apk/release/`: `arm64-v8a`, para celulares, e `x86_64`, para o emulador do PC.

**Assinatura:** a chave fica fora do git. O `android/local.properties` aponta para um arquivo `.properties` com `assinatura=<caminho>`. Esse arquivo tem `storeFile`, `storePassword`, `keyAlias` e `keyPassword`. Sem ele, o APK de release sai sem assinatura.

**IAs e placas:** o ncnn novo não ajusta sozinho o que cada placa aceita. Na primeira vez, o `jni.cpp` testa cada IA numa imagem pequena. A ordem é:

1. fp16 ligado;
2. o fp16 que a placa diz aceitar;
3. sem fp16;
4. só no processador.

O primeiro que der certo fica valendo. No emulador do PC, o RIFE só funciona com fp16 e o Real-ESRGAN só sem.

## Como funciona

- **`src/native.ts`:** a ponte com o Android, o plugin `Engine`. No navegador, ela vira a demonstração.
- **`src/jobs.ts`:** a fila.
  - **Download:** yt-dlp → `publish` na galeria.
  - **Preparo:** ffmpeg.
  - **IA:** os quadros são separados com o ffmpeg em pedaços pequenos, passam pela IA no `libaiengine.so` e voltam a ser vídeo.
- **`src/ffargs.ts`:** monta o comando do ffmpeg (geometria, cor, texto e codificador).
- **`android/app/src/main/java/.../EnginePlugin.kt`:** roda o yt-dlp e o ffmpeg da youtubedl-android linha a linha, com progresso e cancelamento. Também cuida da galeria (MediaStore), do download dos modelos e do compartilhar.
- **`android/app/src/main/cpp/`:**
  - `jni.cpp`: lê e grava os PNG e chama o RIFE ou o Real-ESRGAN.
  - Código do [rife-ncnn-vulkan](https://github.com/nihui/rife-ncnn-vulkan) (MIT) e do [Real-ESRGAN-ncnn-vulkan](https://github.com/xinntao/Real-ESRGAN-ncnn-vulkan) (MIT). O Real-ESRGAN foi adaptado para compilar os shaders na hora, como o RIFE já faz, e o `warp.cpp` sem o `pack8`, que o ncnn novo não tem mais.
