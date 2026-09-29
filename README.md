# ⚡ Tripo3D GLB Downloader & Blender Bridge (Edge & Chrome Extension)

[![GitHub Stars](https://img.shields.io/github/stars/Bieuulls/TRIPO_EDGE_EXTENSION?style=social)](https://github.com/Bieuulls)
[![Author](https://img.shields.io/badge/Author-Bieuulls-00ffb2?logo=github)](https://github.com/Bieuulls)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Extensão profissional para Microsoft Edge e Google Chrome que permite **extrair e baixar modelos 3D (.GLB)** gerados na plataforma [studio.tripo3d.ai](https://studio.tripo3d.ai) com **1 clique**, além de integrar diretamente com o **Blender** via ponte HTTP local em tempo real.

---

## 🌟 Apoie o Projeto!

> Se esta extensão foi útil para você, por favor **ajude deixando uma estrela (⭐ Star) no repositório** e divulgue para seus amigos e comunidades 3D!  
> Ao utilizar ou criar conteúdo sobre ela, **não esqueça dos créditos**.  
> Qualquer ajuda, sugestão e melhoria do projeto será extremamente bem-vinda!

👤 **Desenvolvido por:** [@Bieuulls](https://github.com/Bieuulls)

---

## ✨ Funcionalidades

- 📥 **Download de Modelos 3D (.GLB) com 1 Clique:** Detecta automaticamente o modelo renderizado na tela ou através da API interna do Tripo3D e faz o download direto para sua pasta de Downloads com texturas completas (PBR).
- 🚀 **Blender Bridge Integrado:** Envia o modelo 3D diretamente para a cena ativa do seu Blender via servidor local (porta `8766`) sem precisar importar arquivos manualmente.
- 📐 **Interface Nativa em Barra Lateral (Side Panel):** Projetada especificamente para a barra lateral do Microsoft Edge e Google Chrome, permitindo navegar no Tripo3D e monitorar modelos sem trocar de janela.
- 🔍 **Detecção Automática de Projetos:** Reconhece o ID do projeto a partir da URL da aba e recupera as URLs oficiais do asset direto da CDN.

---

## 🚀 Como Instalar

1. Baixe ou clone este repositório:
   ```bash
   git clone https://github.com/Bieuulls/TRIPO_EDGE_EXTENSION.git
   ```
2. Abra o Microsoft Edge (ou Chrome) e acesse:
   - **Edge:** `edge://extensions`
   - **Chrome:** `chrome://extensions`
3. Ative o **Modo de Desenvolvedor** no canto superior ou lateral.
4. Clique em **Carregar sem compactação** (ou *Load unpacked*).
5. Selecione a pasta da extensão `TRIPO_EDGE_EXTENSION`.
6. Pronto! A extensão estará pronta na barra lateral.

---

## 🛠️ Como Usar

1. Acesse [studio.tripo3d.ai](https://studio.tripo3d.ai) e gere seu modelo 3D.
2. Abra a barra lateral da extensão clicando no ícone do Tripo3D.
3. A extensão detectará automaticamente o modelo finalizado.
4. Clique em:
   - **📥 Baixar Arquivo .GLB**: para salvar o arquivo no seu computador.
   - **🚀 Enviar Direto pro Blender**: para carregar instantaneamente na sua cena do Blender (com a bridge ativa).

---

## 🤝 Créditos & Contribuições

Desenvolvido com carinho por **[Bieuulls](https://github.com/Bieuulls)**.

Pull requests, correções de bugs e novas ideias são sempre bem-vindas! Sinta-se à vontade para abrir uma *Issue* ou enviar um *Pull Request*.
