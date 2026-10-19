# Vinyl Video Creator

Веб-приложение: из трека и обложки собирает видео с крутящейся виниловой пластинкой.

**Лицензия: [GPL-3.0](https://www.gnu.org/licenses/gpl-3.0.html)**  
Код свободный для изучения и модификации; распространение и продажа производных продуктов — только на условиях GPL-3.0 (с открытием исходников).

---

## Возможности

- Сцены: **пластинка**, **слипкейс**, **проигрыватель** (игла едет к центру)
- Режимы: под длину трека / **один оборот** (1 RPM · 60 с)
- Стиль диска: этикетка или полная текстура обложки
- Бороздки, царапины, тень (цвет + сила)
- Виниловый crackle (встроенный семпл или свой файл)
- Постобработка: виньетка, сепия, Ч/Б, тёплый/холодный тон, контраст, зерно
- Фон: цвет, картинка / GIF / видео + blur / затемнение
- Позиция объекта: сверху / центр / снизу
- Отрезок трека (С–До), fade in/out, громкость, AAC 128–320 kbps

---

## Зависимости

### Система

| Что | Зачем |
|-----|--------|
| **Node.js ≥ 18** | сервер |
| **ffmpeg** + **ffprobe** | сборка видео/аудио |
| Библиотеки для **node-canvas** | см. ниже |

**Ubuntu / Debian:**

```bash
sudo apt update
sudo apt install -y ffmpeg build-essential libcairo2-dev libpango1.0-dev \
  libjpeg-dev libgif-dev librsvg2-dev pkg-config
```

**macOS (Homebrew):**

```bash
brew install ffmpeg pkg-config cairo pango libpng jpeg giflib librsvg
```

**Windows:** поставьте [ffmpeg](https://ffmpeg.org/download.html) в `PATH` и [build tools](https://github.com/Automattic/node-canvas/wiki/Installation:-Windows) для canvas.

### npm

```
express   — HTTP-сервер
multer    — загрузка файлов
canvas    — отрисовка пластинки / слипа / проигрывателя
```

`fluent-ffmpeg` в рантайме **не обязателен** — вызывается бинарник `ffmpeg` напрямую.

---

## Установка и запуск

```bash
git clone https://github.com/minusnan/Vinylizer-JS.git
cd Vinylizer-JS
npm install
npm start
```

Откройте в браузере: **http://localhost:3000**

Порт можно задать: `PORT=8080 npm start`.

### Структура

```
├── server/
│   ├── index.js          # Express + ffmpeg-пайплайн
│   └── public/index.html # UI
├── lib/
│   ├── prepareDisc.js    # пластинка
│   ├── sleeve.js         # слипкейс
│   └── turntable.js      # корпус + тонарм
├── assets/
│   └── vinyl_crackle.wav # crackle по умолчанию
├── uploads/              # временные загрузки (в .gitignore)
└── outputs/              # готовые mp4 (в .gitignore)
```

---

## Использование

1. Загрузите **аудио** и **обложку**.
2. При желании — фон, свой crackle-семпл.
3. Выберите сцену, стиль, время, эффекты.
4. **Сгенерировать видео** → превью и скачивание mp4.

Генерация идёт на машине, где запущен сервер; нужны CPU и место на диске.

---

## Лицензия

```
Copyright (C) 2026
This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
```

Полный текст: https://www.gnu.org/licenses/gpl-3.0.html  

На GitHub в Settings → General → License выберите **GNU General Public License v3.0**, либо положите файл `LICENSE` с текстом GPL-3.0 в корень репозитория.
