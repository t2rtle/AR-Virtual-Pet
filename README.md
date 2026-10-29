# AR Virtual Pet

Um jogo de pet virtual 3D com foco em realidade aumentada (AR). É necessário usar um dispositivo e navegador compatíveis com AR e conceder acesso à câmera.

🌐 **Site do jogo:** [Jogar AR Virtual Pet](https://t2rtle.github.io/AR-Virtual-Pet/)

## O que já existe

- 📷 Entrada em realidade aumentada com WebXR/ARCore quando suportada
- 🐾 Pet 3D procedural leve, sem depender de um modelo externo
- 📷 Experiência AR pela webcam em navegadores desktop compatíveis
- 🍎 Alimentar, 🎾 brincar, ❤️ carinho e 🫧 limpeza
- 📊 Fome, humor, energia e higiene
- 💾 Progresso salvo automaticamente no navegador
- 🏷️ Nome personalizado
- 🔊 Som e 📳 vibração configuráveis
- 📱 Interface responsiva e PWA instalável
- 📴 Service Worker para cache dos arquivos principais

## Publicação

O projeto é estático e pode ser publicado pelo GitHub Pages. A experiência principal exige câmera e suporte a realidade aumentada. Em dispositivos móveis, o site precisa estar em HTTPS e o navegador deve oferecer WebXR immersive-ar (e, em Android, os serviços ARCore quando exigidos). Em computadores compatíveis, o site pode usar a webcam para sobrepor o pet à imagem da câmera. Não existe mais modo de treino sem AR.

## Próximos upgrades

- posicionamento por hit-test real com retículo e toque
- animações Idle/Walk/Run
- brinquedos e inventário
- necessidades, XP e evolução
- sombras e oclusão mais avançadas
- sons em arquivos de mídia
- sistema de visitas, conquistas e personalização
- modelo GLB dedicado com animações
