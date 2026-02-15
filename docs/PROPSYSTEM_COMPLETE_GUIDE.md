# Movian Prop System - Полная Документация

**Дата создания:** 9 февраля 2026  
**На основе:** Исходного кода Movian (C) и анализа архитектуры  
**Автор:** Анализ ИИ на основе кода из `/home/dietpi/workspace/movian/src/`

---

## Содержание

1. [Общий Обзор](#1-общий-обзор)
2. [Структура Prop (C Уровень)](#2-структура-prop-c-уровень)
3. [Типы Prop](#3-типы-prop)
4. [Иерархия Prop Дерева](#4-иерархия-prop-дерева)
5. [Система Подписок (Subscriptions)](#5-система-подписок-subscriptions)
6. [Navigator Props](#6-navigator-props)
7. [Media Props](#7-media-props)
8. [JavaScript Bindings](#8-javascript-bindings)
9. [Prop Linking и Linkselected](#9-prop-linking-и-linkselected)
10. [HTTP Prop API (prop_http.c)](#10-http-prop-api-prop_httpc)
11. [Thread Safety и Dispatch](#11-thread-safety-и-dispatch)
12. [Практические Примеры](#12-практические-примеры)
13. [Отладка Props](#13-отладка-props)

---

## 1. Общий Обзор

### 1.1 Что такое Prop System?

Prop system в Movian - это реактивная система управления свойствами (properties), которая:
- Обеспечивает связь между разными компонентами (UI, медиа, навигация, плагины)
- Поддерживает подписки на изменения (observable pattern)
- Позволяет создавать символические ссылки (linking)
- Работает в многопоточной среде с синхронизацией
- Имеет HTTP API для удаленного доступа и отладки

### 1.2 Основные Компоненты

```
┌─────────────────────────────────────────┐
│         JavaScript (Plugins)            │
│    require('movian/prop')               │
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│    ECMAScript Bindings (es_prop.c)      │
│    - Duktape JS Engine                  │
│    - Native Object Wrappers               │
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│      Prop Core (prop_core.c)            │
│    - prop_t structures                   │
│    - Subscription management             │
│    - Thread dispatch                     │
└──────────────────┬──────────────────────┘
                   │
┌──────────────────┴──────────────────────┐
│   Navigator    │    Media    │   UI  │
│   (navigator.c)│   (media.c) │ (glw) │
└────────────────┴─────────────┴───────┘
                   │
┌──────────────────▼──────────────────────┐
│    HTTP API (prop_http.c)               │
│    - GET /api/prop/path               │
│    - POST /api/prop/path              │
│    - Debug interface                  │
└─────────────────────────────────────────┘
```

---

## 2. Структура Prop (C Уровень)

### 2.1 Основная Структура `prop_t`

**Файл:** `src/prop/prop_i.h` (строки 149-377)

```c
struct prop {
    // --- Ссылочный счетчик ---
    atomic_t hp_refcount;              // Атомарный счетчик ссылок
    const char *hp_name;               // Имя свойства
    
    // --- Родительская связь ---
    union {
        struct {
            struct prop *hp_parent;    // Указатель на родителя
            // Список "братьев" (других child у родителя)
            TAILQ_ENTRY(prop) hp_parent_link;
            // Подписчики на изменения значения
            struct prop_sub_list hp_value_subscriptions;
            // Канонические подписчики
            struct prop_sub_list hp_canonical_subscriptions;
        };
        
        // Альтернативная структура для PROXY props
        struct {
            struct prop_list hp_owned;
            // ... proxy-специфичные поля
        };
    };
    
    // --- Связи (Linking) ---
    struct prop *hp_originator;        // Исходный prop (для symlink)
    LIST_ENTRY(prop) hp_originator_link;
    struct prop_list hp_targets;        // Props, которые ссылаются на этот
    
    // --- Тип и флаги ---
    prop_type_t hp_type;               // Тип prop (void, int, string, dir...)
    uint8_t hp_xref;                   // Расширенный ref count
    uint16_t hp_flags;                 // Флаги (monitored, multi-sub, etc.)
    
    // --- Теги (metadata) ---
    struct prop_tag *hp_tags;         // Произвольные key-value пары
    
    // --- Данные (union) ---
    union {
        struct { 
            float val, min, max; 
        } f;                           // Float с clipping
        
        struct { 
            int val, min, max; 
        } i;                           // Int с clipping
        
        struct { 
            rstr_t *rstr; 
            prop_str_type_t type; 
        } rstr;                        // Reference-counted string
        
        const char *cstr;              // Const string
        
        struct {
            struct prop_queue childs;  // Директория: очередь childs
            struct prop *selected;     // Выбранный child
        } c;
        
        // ... другие типы
    } u;
};
```

### 2.2 Структура Подписки `prop_sub_t`

**Файл:** `src/prop/prop_i.h` (строки 421-546)

```c
struct prop_sub {
    void *hps_callback;               // Callback функция
    void *hps_opaque;                 // Пользовательские данные
    prop_trampoline_t *hps_trampoline; // Трансформация значения
    
    // --- Dispatch ---
    void *hps_dispatch;               // Courier или dispatch group
    void *hps_lock;                   // Lock для callback
    lockmgr_fn_t *hps_lockmgr;       // Lock manager
    
    // --- Связи с prop ---
    LIST_ENTRY(prop_sub) hps_value_prop_link;
    prop_t *hps_value_prop;          // Prop, на который подписались
    
    union {
        struct {
            prop_t *hps_canonical_prop;
            prop_originator_tracking_t *hps_pots;
        };
        struct {
            struct prop_proxy_connection *hps_ppc;
            // ... proxy fields
        };
    };
    
    atomic_t hps_refcount;
    uint8_t hps_zombie;               // Подписка уничтожается
    uint8_t hps_dispatch_mode : 2;   // Режим доставки
    uint8_t hps_proxy : 1;           // Proxy подписка
    uint16_t hps_flags;              // Флаги подписки
    int hps_user_int;                // Пользовательское значение
};
```

---

## 3. Типы Prop

### 3.1 Enum `prop_type_t`

**Файл:** `src/prop/prop_i.h` (строки 132-143)

```c
typedef enum {
    PROP_VOID,         // Пустое/неустановленное значение
    PROP_DIR,          // Директория (контейнер с children)
    PROP_RSTRING,      // Reference-counted string (rstr_t)
    PROP_CSTRING,      // Const char* string
    PROP_FLOAT,        // Floating point
    PROP_INT,          // Integer
    PROP_URI,          // URI с заголовком
    PROP_PROP,         // Ссылка на другой prop
    PROP_ZOMBIE,       // Уничтоженный prop (финальное состояние)
    PROP_PROXY,        // Удаленный prop (IPC)
} prop_type_t;
```

### 3.2 Описание Типов

| Тип | Описание | Пример Использования |
|-----|----------|---------------------|
| `PROP_VOID` | Пустое значение, null в JS | Пустой prop перед установкой |
| `PROP_DIR` | Контейнер с child props | `navigators`, `media` |
| `PROP_RSTRING` | Строка с ref counting | Заголовки, URLы |
| `PROP_CSTRING` | Постоянная строка | Константы, имена |
| `PROP_FLOAT` | Число с плавающей точкой | Duration, position |
| `PROP_INT` | Целое число | Counters, IDs |
| `PROP_URI` | URI с metadata | Stream URLs |
| `PROP_PROP` | Ссылка на prop | Linkselected |
| `PROP_ZOMBIE` | Мертвый prop | После destroy() |
| `PROP_PROXY` | Удаленный prop | IPC между процессами |

---

## 4. Иерархия Prop Дерева

### 4.1 Полная Структура

```
prop.global (корень)
│
├── navigators                      [navs = prop_create(global, "navigators")]
│   ├── nodes                       [all_navigators]
│   │   └── [navigator 0]         [nav_create()]
│   │       ├── pages               [nav_prop_pages]
│   │       │   └── [page root]     [np_prop_root]
│   │       │       ├── url         [np_url] - "videoparams:..."
│   │       │       ├── parentUrl   [np_parent_url]
│   │       │       ├── source      ← ВИДЕОПАРАМЕТРЫ ДЛЯ UPNP
│   │       │       ├── how         [np_how]
│   │       │       ├── directClose
│   │       │       ├── close
│   │       │       ├── eventSink
│   │       │       ├── model       [page_model, created by backend/plugin]
│   │       │       ├── previous    [parent_model]
│   │       │       ├── metadata
│   │       │       │   └── duration
│   │       │       ├── media
│   │       │       │   ├── metadata
│   │       │       │   │   └── duration
│   │       │       │   └── playstatus
│   │       │       └── persistent  [kv_store binding]
│   │       │
│   │       ├── currentpage         [nav_prop_curpage] ← LINKED
│   │       ├── canGoBack           [nav_prop_can_go_back]
│   │       ├── canGoForward        [nav_prop_can_go_fwd]
│   │       ├── canGoHome           [nav_prop_can_go_home]
│   │       └── eventSink           [eventsink]
│   │
│   └── current                     [linkselected → активный navigator]
│       ├── pages                   (same as above)
│       ├── currentpage             ← ПРЯМАЯ ССЫЛКА
│       ├── source                  ← ВИДЕОПАРАМЕТРЫ ДЛЯ ВСЕХ ТИПОВ
│       └── ...
│
└── media                           [media_prop_root]
    ├── eventSink                   [media events]
    ├── sources                     [media_prop_sources]
    │   └── [media_pipe 0]          [mp_create()]
    │       ├── url                 [mp_prop_url]
    │       ├── primary             [mp_prop_primary]
    │       ├── metadata            [mp_prop_metadata]
    │       │   ├── duration        [время окончания]
    │       │   ├── audiostreams    [список аудио]
    │       │   └── subtitlestreams [список субтитров]
    │       │
    │       ├── video               [mp_prop_video]
    │       │   ├── settings        [настройки видео]
    │       │   └── active        [ссылка на аудио]
    │       │
    │       ├── audio               [mp_prop_audio]
    │       │   ├── current         [текущий трек]
    │       │   ├── manual          [ручной выбор]
    │       │   ├── sorted          [отсортированный список]
    │       │   ├── tracks          [все треки]
    │       │   └── settings        [настройки]
    │       │
    │       ├── subtitle            [mp_prop_subtitle]
    │       │   ├── current         [текущие субтитры]
    │       │   ├── manual          [ручной выбор]
    │       │   ├── sorted          [отсортированный список]
    │       │   └── tracks          [все треки]
    │       │
    │       ├── buffer              [mp_prop_buffer_*]
    │       │   ├── current         [текущий буфер]
    │       │   ├── limit           [лимит]
    │       │   └── delay           [задержка]
    │       │
    │       ├── io                  [mp_prop_io]
    │       ├── notifications       [mp_prop_notifications]
    │       ├── playstatus          [play/pause/stop]
    │       ├── pausereason         [причина паузы]
    │       ├── currenttime         [текущая позиция]
    │       ├── fps                 [frames per second]
    │       ├── avdelta             [audio/video delta]
    │       ├── svdelta             [subtitle/video delta]
    │       ├── shuffle             [случайный порядок]
    │       ├── repeat              [повтор]
    │       ├── canSkipBackward     [можно ли назад]
    │       ├── canSkipForward      [можно ли вперед]
    │       ├── canSeek             [можно ли seek]
    │       ├── canPause            [можно ли паузу]
    │       ├── canEject            [можно ли извлечь]
    │       ├── canShuffle          [можно ли shuffle]
    │       ├── canRepeat           [можно ли repeat]
    │       ├── canStop             [можно ли остановить]
    │       ├── ctrl                [control prop]
    │       └── model               [model для UI]
    │
    └── current                     [linkselected → primary media_pipe]
        ├── url
        ├── metadata
        │   └── duration
        └── ...
```

### 4.2 Важные Пути (JavaScript)

| Путь | Описание | Когда Использовать |
|------|----------|-------------------|
| `prop.global.navigators.current` | Текущий navigator | Доступ к текущей навигации |
| `prop.global.navigators.current.currentpage` | Текущая страница | UI, breadcrumbs |
| `prop.global.navigators.current.source` | **Источник видео** | **ВСЕГДА для UPNP/Torrent/Local** |
| `prop.global.navigators.current.currentpage.source` | Source страницы | Только для HLS |
| `prop.global.media.current` | Текущее воспроизведение | Мониторинг playback |
| `prop.global.media.current.url` | URL потока | Определение старта/стопа |
| `prop.global.media.current.metadata.duration` | Длительность | Probe duration |

### 4.3 Разница: current vs currentpage

**Критическое различие для UPNP/Torrent/Local:**

```javascript
// Для HLS (всё работает):
prop.global.navigators.current.currentpage.source
// → "videoparams:{...}" ✓

// Для UPNP (проблема):
prop.global.navigators.current.currentpage.source
// → NULL (текущая страница = папка)

// Решение для всех типов:
prop.global.navigators.current.source
// → "videoparams:{...}" ✓
```

**Почему так происходит:**

```c
// navigator.c:446
prop_link(np->np_prop_root, nav->nav_prop_curpage);

// np_prop_root = корень текущей страницы
// nav_prop_curpage = currentpage (симлинк)
// 
// Для файла: np_prop_root содержит videoparams в source
// Для папки: np_prop_root не содержит videoparams
// 
// НО: navigators.current.source всегда содержит последний source!
```

---

## 5. Система Подписок (Subscriptions)

### 5.1 Флаги Подписок

**Файл:** `src/prop/prop.h` (строки 135-152)

```c
#define PROP_SUB_TRACK_DESTROY          0x1   // Уведомлять при уничтожении
#define PROP_SUB_DEBUG                  0x2   // Включить отладку
#define PROP_SUB_SUBSCRIPTION_MONITOR   0x4   // Мониторить другие подписки
#define PROP_SUB_EXPEDITE               0x8   // Высокий приоритет
#define PROP_SUB_MULTI                 0x10   // Multi-подписка
#define PROP_SUB_INTERNAL              0x20   // Внутренняя подписка
#define PROP_SUB_IGNORE_VOID           0x40   // Игнорировать void
#define PROP_SUB_NO_INITIAL_UPDATE    0x200   // Пропустить начальное значение
```

### 5.2 Режимы Доставки

```c
#define PROP_SUB_DISPATCH_MODE_COURIER 0  // Выделенный courier поток
#define PROP_SUB_DISPATCH_MODE_GLOBAL  1  // Глобальный пул потоков (4-8)
#define PROP_SUB_DISPATCH_MODE_GROUP   2  // Общая dispatch группа
```

### 5.3 Теги для Подписки

```c
enum {
    PROP_TAG_END = 0,
    PROP_TAG_NAME_VECTOR,       // Вектор имен (путь)
    PROP_TAG_CALLBACK,          // Общий callback
    PROP_TAG_CALLBACK_STRING,   // String callback
    PROP_TAG_CALLBACK_INT,      // Int callback
    PROP_TAG_CALLBACK_FLOAT,    // Float callback
    PROP_TAG_CALLBACK_RSTR,     // rstr_t callback
    PROP_TAG_CALLBACK_EVENT,    // Event callback
    PROP_TAG_COURIER,           // Назначить courier
    PROP_TAG_DISPATCH_GROUP,    // Назначить группу
    PROP_TAG_ROOT,              // Корневой prop
    PROP_TAG_NAMED_ROOT,        // Именованный корень
    PROP_TAG_MUTEX,             // Mutex для callback
    PROP_TAG_LOCKMGR,           // Lock manager
};
```

### 5.4 Примеры Подписок

**Пример 1: Подписка на URL (из navigation-observer.js)**

```c
// C код
prop_subscribe(0,
    PROP_TAG_NAMED_ROOT, np->np_prop_root, "page",
    PROP_TAG_NAME("page", "url"),
    PROP_TAG_CALLBACK, onUrlChange, userdata,
    PROP_TAG_MUTEX, &nav_mutex,
    NULL);

// JavaScript эквивалент
prop.subscribeValue(
    prop.global.navigators.current.currentpage.url,
    function(value) {
        console.log('URL changed:', value);
    }
);
```

**Пример 2: Подписка на playstatus**

```c
// C код
prop_subscribe(0,
    PROP_TAG_ROOT, playstatus_prop,
    PROP_TAG_CALLBACK_STRING, onPlayStatusChange, userdata,
    PROP_TAG_MUTEX, &mutex,
    NULL);

// JavaScript
prop.subscribeValue(
    prop.global.navigators.current.currentpage.media.playstatus,
    function(status) {
        if (status === 'play') {
            console.log('Playback started');
        }
    }
);
```

### 5.5 События (Events)

**Файл:** `src/prop/prop.h` (строки 57-94)

```c
typedef enum {
    // --- Установка значения ---
    PROP_SET_VOID,              // Установлен в void
    PROP_SET_RSTRING,           // Установлен rstr_t
    PROP_SET_CSTRING,           // Установлен const char*
    PROP_SET_INT,               // Установлен int
    PROP_SET_FLOAT,             // Установлен float
    PROP_SET_DIR,               // Установлена директория
    PROP_SET_URI,               // Установлен URI
    PROP_SET_PROP,              // Установлена ссылка на prop
    
    // --- Дети (children) ---
    PROP_ADD_CHILD,             // Добавлен child
    PROP_ADD_CHILD_BEFORE,      // Добавлен перед другим
    PROP_ADD_CHILD_VECTOR,      // Добавлено несколько
    PROP_DEL_CHILD,             // Удален child
    PROP_MOVE_CHILD,            // Перемещен child
    PROP_SELECT_CHILD,          // Выбран child
    
    // --- Запросы ---
    PROP_REQ_NEW_CHILD,         // Запрос создания child
    PROP_REQ_DELETE,            // Запрос удаления
    PROP_DESTROYED,             // Prop уничтожен
    
    // --- Внешние события ---
    PROP_EXT_EVENT,             // Внешнее событие
} prop_event_t;
```

---

## 6. Navigator Props

### 6.1 Структуры Navigator

**`navigator_t`** - Управляет навигацией:

```c
typedef struct navigator {
    LIST_ENTRY(navigator) nav_link;
    
    struct nav_page_queue nav_pages;      // Все страницы
    struct nav_page_queue nav_history;    // История навигации
    nav_page_t *nav_page_current;         // Текущая страница
    
    // Prop hierarchy
    prop_t *nav_prop_root;                // Корень навигатора
    prop_t *nav_prop_pages;               // Контейнер страниц
    prop_t *nav_prop_curpage;             // Текущая страница (ссылка)
    prop_t *nav_prop_can_go_back;         // Можно ли назад
    prop_t *nav_prop_can_go_fwd;          // Можно ли вперед
    prop_t *nav_prop_can_go_home;         // Можно ли домой
    
    prop_sub_t *nav_eventsink;            // Подписка на события
    prop_sub_t *nav_dtor_tracker;         // Отслеживание уничтожения
} navigator_t;
```

**`nav_page_t`** - Отдельная страница:

```c
typedef struct nav_page {
    struct navigator *np_nav;
    
    TAILQ_ENTRY(nav_page) np_global_link;
    TAILQ_ENTRY(nav_page) np_history_link;
    
    prop_t *np_prop_root;        // Корень страницы
    char *np_url;                // URL страницы
    char *np_parent_url;         // URL родителя
    
    // Model links
    prop_t *np_item_model_src;
    prop_t *np_item_model_dst;
    prop_t *np_parent_model_src;
    prop_t *np_parent_model_dst;
    
    // Subscriptions
    prop_sub_t *np_close_sub;
    prop_sub_t *np_eventsink_sub;
    prop_sub_t *np_direct_close_sub;
    
    // Bookmark props
    prop_t *np_bookmarked;
    prop_sub_t *np_bookmarked_sub;
} nav_page_t;
```

### 6.2 Создание Navigator Props

**Из `navigator.c:248-322`:**

```c
// 1. Создание корня навигаторов
nav->nav_prop_root = prop_create(all_navigators, NULL);

// 2. Создание детей
nav->nav_prop_pages       = prop_create(nav->nav_prop_root, "pages");
nav->nav_prop_curpage     = prop_create(nav->nav_prop_root, "currentpage");
nav->nav_prop_can_go_back = prop_create(nav->nav_prop_root, "canGoBack");
nav->nav_prop_can_go_fwd  = prop_create(nav->nav_prop_root, "canGoForward");
nav->nav_prop_can_go_home = prop_create(nav->nav_prop_root, "canGoHome");

// 3. Создание linkselected для "current"
prop_linkselected_create(all_navigators, navs, "current", NULL);
```

### 6.3 Создание Страницы

**Из `navigator.c:634-708`:**

```c
// 1. Создание корня страницы
np->np_prop_root = prop_create_root(NULL);

// 2. Привязка к kvstore (для закладок)
kv_prop_bind_create(
    prop_create(np->np_prop_root, "persistent"),
    np->np_url
);

// 3. Установка свойств
prop_set(np->np_prop_root, "url",       PROP_SET_STRING, np->np_url);
prop_set(np->np_prop_root, "parentUrl", PROP_SET_STRING, np->np_parent_url);
prop_set(np->np_prop_root, "how",       PROP_SET_STRING, np->np_how);

// 4. Связывание с currentpage
prop_link(np->np_prop_root, nav->nav_prop_curpage);
```

---

## 7. Media Props

### 7.1 Структура Media Pipe

**Ключевые поля `media_pipe_t`:**

```c
typedef struct media_pipe {
    // --- Иерархия ---
    prop_t *mp_prop_root;           // Корень (media.sources.*)
    prop_t *mp_prop_metadata;       // Метаданные
    prop_t *mp_prop_primary;        // Primary флаг
    
    // --- Состояние воспроизведения ---
    prop_t *mp_prop_playstatus;      // "play"/"pause"/"stop"
    prop_t *mp_prop_pausereason;
    prop_t *mp_prop_currenttime;     // Текущая позиция (сек)
    prop_t *mp_prop_fps;
    
    // --- URL и информация ---
    prop_t *mp_prop_url;            // URL потока
    prop_t *mp_prop_io;
    prop_t *mp_prop_notifications;
    
    // --- Видео ---
    prop_t *mp_prop_video;
    prop_t *mp_setting_video_root;
    
    // --- Аудио ---
    prop_t *mp_prop_audio;
    prop_t *mp_prop_audio_tracks;
    prop_t *mp_prop_audio_track_current;
    prop_t *mp_prop_audio_track_current_manual;
    
    // --- Субтитры ---
    prop_t *mp_prop_subtitle_tracks;
    prop_t *mp_prop_subtitle_track_current;
    
    // --- Буфер ---
    prop_t *mp_prop_buffer_current;
    prop_t *mp_prop_buffer_limit;
    prop_t *mp_prop_buffer_delay;
    
    // --- Возможности управления ---
    prop_t *mp_prop_canSkipBackward;
    prop_t *mp_prop_canSkipForward;
    prop_t *mp_prop_canSeek;
    prop_t *mp_prop_canPause;
    prop_t *mp_prop_canEject;
    prop_t *mp_prop_canShuffle;
    prop_t *mp_prop_canRepeat;
    prop_t *mp_prop_shuffle;
    prop_t *mp_prop_repeat;
    
    // --- Подписки ---
    prop_sub_t *mp_sub_currenttime;
    prop_sub_t *mp_sub_eventsink;
} media_pipe_t;
```

### 7.2 Создание Media Props

**Из `media.c:143-250`:**

```c
// 1. Создание корня media pipe
mp->mp_prop_root = prop_create(media_prop_sources, NULL);

// 2. Создание метаданных
mp->mp_prop_metadata = prop_create(mp->mp_prop_root, "metadata");

// 3. URL
mp->mp_prop_url = prop_create(mp->mp_prop_root, "url");

// 4. Состояние воспроизведения
mp->mp_prop_playstatus = prop_create(mp->mp_prop_root, "playstatus");
mp->mp_prop_currenttime = prop_create(mp->mp_prop_root, "currenttime");

// 5. Видео/Аудио
mp->mp_prop_video = prop_create(mp->mp_prop_root, "video");
mp->mp_prop_audio = prop_create(mp->mp_prop_root, "audio");

// 6. Стать primary (link to media.current)
mp_become_primary(mp);
```

### 7.3 Становление Primary

**Из `media.c:522`:**

```c
void mp_become_primary(media_pipe_t *mp) {
    // Создаем ссылку на media.current
    prop_link(mp->mp_prop_root, media_prop_current);
    
    // Уведомляем подписчиков
    prop_set_int(mp->mp_prop_primary, 1);
}
```

---

## 8. JavaScript Bindings

### 8.1 Экспортируемые Функции

**Из `es_prop.c` (строки 1100-1139):**

```c
static const duk_function_list_entry fnlist_prop[] = {
    { "create",              es_prop_create_duk,            1 },
    { "getValue",            es_prop_get_value_duk,         1 },
    { "getName",             es_prop_get_name_duk,          1 },
    { "getChild",            es_prop_get_child_duk,         2 },
    { "set",                 es_prop_set_value_duk,         3 },
    { "setRichStr",          es_prop_set_rich_str_duk,      3 },
    { "setParent",           es_prop_set_parent_duk,        2 },
    { "subscribe",           es_prop_subscribe,             3 },
    { "haveMore",            es_prop_have_more,             2 },
    { "makeUrl",             es_prop_make_url,              1 },
    { "enumerate",           es_prop_enum_duk,              1 },
    { "has",                 es_prop_has_duk,               2 },
    { "deleteChild",         es_prop_delete_child_duk,      2 },
    { "deleteChilds",        es_prop_delete_childs_duk,     1 },
    { "destroy",             es_prop_destroy_duk,           1 },
    { "select",              es_prop_select,                1 },
    { "link",                es_prop_link,                  2 },
    { "unlink",              es_prop_unlink,                1 },
    { "sendEvent",           es_prop_send_event_duk,        3 },
    { "isValue",             es_prop_is_value,                1 },
    { "atomicAdd",           es_prop_atomic_add_duk,        2 },
    { "isSame",              es_prop_is_same,               2 },
    { "moveBefore",          es_prop_move_before,           2 },
    { "unloadDestroy",       es_prop_unload_destroy,        1 },
    { "isZombie",            es_prop_is_zombie,             1 },
    { "setClipRange",        es_prop_set_clip_range,        3 },
    { "tagSet",              es_prop_tag_set,               3 },
    { "tagClear",            es_prop_tag_clear,             2 },
    { "tagGet",              es_prop_tag_get,               2 },
    
    // Node Filter API
    { "nodeFilterCreate",    es_prop_node_filter_create,    2 },
    { "nodeFilterAddPred",   es_prop_node_filter_add_pred,6 },
    { "nodeFilterDelPred",   es_prop_node_filter_del_pred,2 },
    
    { NULL, NULL, 0}
};

ES_MODULE("prop", fnlist_prop);
```

### 8.2 События в JavaScript

**Callback Event Types (из es_prop.c:480-714):**

```javascript
// Строковые типы событий, передаваемые в callback
"dir"              // PROP_SET_DIR - установлена директория
"set"              // PROP_SET_VOID/RSTRING/CSTRING/INT/FLOAT
"uri"              // PROP_SET_URI - установлен URI
"addchild"         // PROP_ADD_CHILD - добавлен child
"addchildbefore"   // PROP_ADD_CHILD_BEFORE - добавлен перед
"addchilds"        // PROP_ADD_CHILD_VECTOR - добавлено несколько
"delchild"         // PROP_DEL_CHILD - удален child
"movechild"        // PROP_MOVE_CHILD - перемещен child
"selectchild"      // PROP_SELECT_CHILD - выбран child
"reqmove"          // PROP_REQ_MOVE_CHILD - запрос перемещения
"destroyed"        // PROP_DESTROYED - prop уничтожен
"wantmorechilds"   // PROP_WANT_MORE_CHILDS - нужно больше children
"action"           // PROP_EXT_EVENT - действие
"unicode"          // PROP_EXT_EVENT - unicode ввод
"propref"          // PROP_EXT_EVENT - ссылка на prop
```

### 8.3 Получение Значений

**Из `es_prop.c:166-246`:**

```c
static int es_prop_get_value_duk(duk_context *ctx) {
    prop_t *p = es_stprop_get(ctx, 0);
    
    switch(p->hp_type) {
        case PROP_CSTRING:
            duk_push_string(ctx, p->hp_cstring);
            break;
            
        case PROP_RSTRING:
            rstr_t *r = rstr_dup(p->hp_rstring);
            duk_push_string(ctx, rstr_get(r));
            rstr_release(r);
            break;
            
        case PROP_FLOAT:
            duk_push_number(ctx, p->hp_float);
            break;
            
        case PROP_INT:
            duk_push_int(ctx, p->hp_int);
            break;
            
        case PROP_VOID:
            duk_push_null(ctx);
            break;
            
        case PROP_DIR:
            // [prop directory {child1, child2, ...}]
            duk_push_string(ctx, directory_description);
            break;
            
        default:
            duk_push_string(ctx, "[prop internal type N]");
    }
}
```

### 8.4 Примеры Использования в JavaScript

**Пример 1: Базовое использование**

```javascript
var prop = require('movian/prop');

// Создание prop
var p = prop.create("myprop");

// Установка значения
prop.set(p, "title", "Hello World");

// Получение child
var child = prop.getChild(p, "metadata");
prop.set(child, "duration", 120);

// Подписка на изменения
var sub = prop.subscribe(p, function(event, value) {
    print("Event: " + event + ", value: " + value);
}, {
    autoDestroy: true,      // Уничтожить подписку при уничтожении prop
    ignoreVoid: false,      // Не игнорировать void значения
    debug: false            // Без отладки
});
```

**Полная таблица опций подписки (из es_prop.c):**

| Опция JS | По умолчанию | C-флаг | Описание |
|----------|-------------|--------|----------|
| `autoDestroy` | `false` | `PROP_SUB_TRACK_DESTROY` | При уничтожении подписанного prop — уничтожить подписку. Без этого флага подписка остаётся "живой" даже после уничтожения prop. |
| `ignoreVoid` | `false` | `PROP_SUB_IGNORE_VOID` | Не вызывать callback когда prop становится void (пустым). Полезно для фильтрации начальных void значений. |
| `debug` | `false` | `PROP_SUB_DEBUG` | Включить отладочный вывод для этой конкретной подписки в логах Movian. |
| `noInitialUpdate` | `false` | `PROP_SUB_NO_INITIAL_UPDATE` | Не вызывать callback с текущим значением при создании подписки. По умолчанию callback вызывается сразу с текущим значением. |
| `earlyChildDelete` | `false` | (custom) | Уведомлять об удалении child props раньше в цикле обработки. |
| `actionAsArray` | `false` | (custom) | Передавать action events как массив аргументов вместо отдельных параметров. |

**subscribe vs subscribeValue:**
- `P.subscribe(prop, cb, opts)` — callback получает `(type, v1, v2)`. `type` = `"set"`, `"destroyed"`, `"dir"` и т.д.
- `P.subscribeValue(prop, cb, opts)` — JS-обёртка, фильтрует `destroyed` события, вызывает callback только со значением. Но объект подписки **не уничтожается** — он продолжает существовать.
- `autoDestroy: true` в `P.subscribe()` — при `PROP_DESTROYED` подписка уничтожается на C-уровне.

// Очистка
prop.destroy(p);
```

**Пример 2: Работа с глобальными props**

```javascript
var P = require('movian/prop');

// Подписка на URL
P.subscribeValue(P.global.navigators.current.currentpage.url, function(url) {
    console.log('Navigated to:', url);
});

// Подписка на медиа
P.subscribeValue(P.global.media.current.url, function(url) {
    if (url) {
        console.log('Playback started:', url);
    } else {
        console.log('Playback stopped');
    }
});

// Чтение duration
var duration = P.global.media.current.metadata.duration;
console.log('Duration:', Number(duration), 'seconds');
```

---

## 9. Prop Linking и Linkselected

### 9.1 Prop Link (Символические Ссылки)

**Концепция:**
```
Source Property (src) ----> Target Property (dst)
         |                        |
    hp_targets              hp_originator
         |                        |
    [dst is here]           [points to src]
```

**Использование:**

```c
// Создание ссылки
prop_link(src, dst);

// Теперь dst всегда отражает значение src
// Подписчики на dst получают уведомления от src

// Удаление ссылки
prop_unlink(dst);
```

**Пример из navigator.c:446:**
```c
// Связываем корень страницы с currentpage
prop_link(np->np_prop_root, nav->nav_prop_curpage);

// Теперь currentpage всегда показывает текущую страницу
```

### 9.2 Linkselected (Автовыбор)

**Концепция:** Автоматически выбирает "текущий" элемент из списка.

**Пример:**
```c
// navigator.c:322
prop_linkselected_create(all_navigators, navs, "current", NULL);

// Теперь navigators.current автоматически указывает
// на активный navigator
```

**Структура:**
```
all_navigators (директория с navigators)
         |
         └─linkselected→ "current" (автоматически выбирает активный)
```

**Когда меняется выбор:**
- При активации нового navigator
- При удалении текущего
- При изменении через prop_select()

### 9.3 Разница Link vs Linkselected

| Feature | prop_link() | prop_linkselected() |
|---------|-------------|---------------------|
| **Связь** | 1:1 (src→dst) | 1:N (dir→current) |
| **Управление** | Ручное | Автоматическое |
| **Использование** | Зеркалирование props | Выбор активного элемента |
| **Пример** | currentpage зеркало | navigators.current |

---

## 10. HTTP Prop API (prop_http.c)

### 10.1 Обзор

**Файл:** `src/prop/prop_http.c`

HTTP API позволяет удаленно:
- Читать prop дерево через HTTP GET
- Отправлять события через HTTP POST
- Включать/выключать debug для props
- Просматривать структуру в браузере

### 10.2 Эндпоинты

**GET /api/prop/[path]**
- Читает prop по пути
- Возвращает HTML или plain text
- Показывает children для директорий

**POST /api/prop/[path]**
- Отправляет действие: `action=имя_действия`
- Включает/выключает debug: `debug=on/off`

### 10.3 Реализация

**Из `prop_http.c:28-35` - Получение prop по пути:**

```c
static prop_t *
prop_from_path(const char *path)
{
    char **n = strvec_split(path, '/');
    prop_t *p = prop_get_by_name((const char **)n, 1, NULL);
    strvec_free(n);
    return p;
}
```

**Пример:**
- Путь: `global/navigators/current/source`
- Разбивается: `["global", "navigators", "current", "source"]`
- Находится: `prop.global.navigators.current.source`

### 10.4 Вывод Значений

**Из `prop_http.c:48-91`:**

```c
static void
emit_value(htsbuf_queue_t *q, int html, prop_t *p)
{
    switch(p->hp_type) {
        case PROP_RSTRING:
            if(html && p->hp_rstrtype == PROP_STR_RICH) {
                htsbuf_qprintf(q, "%s", rstr_get(p->hp_rstring));
            } else {
                emit_str(q, html, rstr_get(p->hp_rstring));
            }
            break;
            
        case PROP_CSTRING:
            emit_str(q, html, p->hp_cstring);
            break;
            
        case PROP_URI:
            emit_str(q, html, rstr_get(p->hp_uri_title));
            htsbuf_qprintf(q, " ");
            emit_str(q, html, rstr_get(p->hp_uri));
            break;
            
        case PROP_FLOAT:
            htsbuf_qprintf(q, "%f", p->hp_float);
            break;
            
        case PROP_INT:
            htsbuf_qprintf(q, "%d", p->hp_int);
            break;
            
        case PROP_VOID:
            htsbuf_qprintf(q, "(void)");
            break;
            
        case PROP_ZOMBIE:
            htsbuf_qprintf(q, "(zombie)");
            break;
            
        case PROP_PROXY:
            htsbuf_qprintf(q, "(proxy)");
            break;
            
        case PROP_PROP:
            htsbuf_qprintf(q, "(prop)");
            break;
            
        case PROP_DIR:
            // Не выводим значение для директорий
            break;
    }
}
```

### 10.5 Вывод Директорий (Таблица)

**Из `prop_http.c:156-206`:**

```c
if(p->hp_type == PROP_DIR) {
    prop_t *c;
    
    htsbuf_qprintf(&out, "directory\n");
    
    if(html)
        htsbuf_qprintf(&out, "<table border=1>\n");
    
    int cnt = 0;
    TAILQ_FOREACH(c, &p->hp_childs, hp_parent_link) {
        char tmp[32];
        const char *cname = c->hp_name;
        const char *ref = c->hp_name;
        
        if(cname == NULL) {
            snprintf(tmp, sizeof(tmp), "*%d", cnt);
            ref = tmp;
            cname = "<unnamed>";
        }
        
        if(html) {
            // HTML таблица со ссылками
            htsbuf_qprintf(&out, "<tr>\n");
            htsbuf_qprintf(&out, "<td><a href=\"/api/prop/%s/%s\">",
                          remain, ref);
            htsbuf_append_and_escape_xml(&out, cname);
            htsbuf_qprintf(&out, "</a>\n");
            htsbuf_qprintf(&out, "<td>");
            if(c->hp_type == PROP_DIR) {
                htsbuf_qprintf(&out, "dir");
            } else {
                emit_value(&out, html, c);
            }
            htsbuf_qprintf(&out, "</tr>\n");
        } else {
            // Plain text
            htsbuf_qprintf(&out, "  %s\n", cname);
        }
        cnt++;
    }
    
    if(html)
        htsbuf_qprintf(&out, "</table>\n");
}
```

### 10.6 Обработка POST

**Из `prop_http.c:123-143`:**

```c
case HTTP_CMD_POST:
    // Отправка события
    if((s = http_arg_get_req(hc, "action")) != NULL) {
        event_t *e = event_create_action_str(s);
        prop_send_ext_event(p, e);  // Отправляем событие в prop
        event_release(e);
        rval = HTTP_STATUS_OK;
        break;
    }
    
    // Включение/выключение debug
    if((s = http_arg_get_req(hc, "debug")) != NULL) {
        hts_mutex_lock(&prop_mutex);
        if(!strcmp(s, "on")) {
            p->hp_flags |= PROP_DEBUG_THIS;
        } else {
            p->hp_flags &= ~PROP_DEBUG_THIS;
        }
        hts_mutex_unlock(&prop_mutex);
        rval = HTTP_STATUS_OK;
        break;
    }
```

### 10.7 Регистрация Эндпоинтов

**Из `prop_http.c:272-280`:**

```c
static void
prop_http_init(void)
{
    http_path_add("/api/prop", NULL, hc_prop, 0);
#ifdef PROP_DEBUG
    http_path_add("/subtrack", NULL, hc_subtrack, 0);
#endif
}

INITME(INIT_GROUP_API, prop_http_init, NULL, 0);
```

### 10.8 Использование HTTP API

**Примеры:**

```bash
# Получить корень prop дерева
GET http://movian-ip:42000/api/prop/global

# Получить текущий navigator
GET http://movian-ip:42000/api/prop/global/navigators/current

# Получить source (videoparams)
GET http://movian-ip:42000/api/prop/global/navigators/current/source

# Получить media URL
GET http://movian-ip:42000/api/prop/global/media/current/url

# Отправить событие
POST http://movian-ip:42000/api/prop/global/navigators/current/currentpage
action=stop

# Включить debug для prop
POST http://movian-ip:42000/api/prop/global/media/current
debug=on
```

### 10.9 Польза для Нашего Плагина

**HTTP API позволяет:**

1. **Удаленная отладка** - проверять prop values без DevTools
2. **Мониторинг** - следить за изменениями через polling
3. **Тестирование** - отправлять события для имитации действий
4. **Документация** - изучать структуру props в браузере

**Пример использования для нашей проблемы:**

```bash
# Проверяем оба пути для UPNP
GET /api/prop/global/navigators/current/source
# → "videoparams:{"title":"font_bug",...}"

GET /api/prop/global/navigators/current/currentpage/source
# → NULL

# Вывод: нужно использовать current.source!
```

---

## 11. Thread Safety и Dispatch

### 11.1 Мьютексы

**Глобальные мьютексы:**
```c
prop_mutex          // Для структуры prop
prop_tag_mutex      // Для операций с тегами
```

**Подписные мьютексы:**
```c
hps_lock            // Мьютекс для callback
hps_lockmgr         // Lock manager function
```

### 11.2 Режимы Доставки

**1. Courier Mode (PROP_SUB_DISPATCH_MODE_COURIER):**
```c
// Выделенный поток для доставки
// Используется JavaScript для thread-safety
prop_courier_t *courier = prop_courier_create_thread(...);

prop_subscribe(PROP_TAG_COURIER, courier, ...);
```

**2. Global Mode (PROP_SUB_DISPATCH_MODE_GLOBAL):**
```c
// Пул потоков (4-8 потоков)
// Управление очередностью
prop_global_dispatch_thread();
```

**3. Group Mode (PROP_SUB_DISPATCH_MODE_GROUP):**
```c
// Общая группа для координированной доставки
prop_sub_t *group = ...;
prop_subscribe(PROP_TAG_DISPATCH_GROUP, group, ...);
```

### 11.3 Поток Безопасности в JavaScript

**Как это работает:**
```c
// es_prop.c:749-755
eps->eps_sub = prop_subscribe(flags,
    PROP_TAG_ROOT, p,
    PROP_TAG_LOCKMGR, ecmascript_context_lockmgr,  // JS lock manager
    PROP_TAG_MUTEX, ec,                             // ECMAScript context
    PROP_TAG_CALLBACK, es_sub_cb, eps,
    PROP_TAG_DISPATCH_GROUP, ec->ec_prop_dispatch_group,
    NULL);
```

**Callback через lock manager:**
- Гарантирует, что JS callback выполняется с правильным lock
- Предотвращает race conditions

---

## 12. Практические Примеры

### 12.1 Наш Плагин: Navigation Observer

**Задача:** Кэшировать videoparams до начала воспроизведения.

**Код (текущая реализация):**

```javascript
// navigation-observer.js
var prop = require('movian/prop');
var log = require('./log');

var lastVideoParams = null;
var lastCachedDuration = 0;
var navigationStack = [];

// Подписка на currentpage.url — кэширование videoparams
prop.subscribeValue(
    prop.global.navigators.current.currentpage.url,
    function(value) {
        if (!value) return;

        var url = String(value);

        // Парсим videoparams из source (приоритет) или url
        var sourceUrl = null;
        try {
            var source = prop.global.navigators.current.currentpage.source;
            if (source) sourceUrl = String(source);
        } catch (e) {}

        var videoParams = parseVideoParams(sourceUrl) || parseVideoParams(url);
        if (videoParams) {
            lastVideoParams = videoParams;
            lastCachedDuration = videoParams.duration || 0;
        }

        // Track navigation stack for parentUrl
        if (url.indexOf('videoparams:') !== 0) {
            navigationStack.push(url);
        }
    }
);

exports.getLastVideoParams = function(caller) {
    // NOT cleared on get — prevents race conditions
    return lastVideoParams;
};

exports.getLastUrl = function() {
    return navigationStack.length > 0
        ? navigationStack[navigationStack.length - 1]
        : null;
};
```

### 12.2 Наш Плагин: Global Observer

**Задача:** Отслеживать начало и окончание воспроизведения.

```javascript
// global-observer.js
var P = require('movian/prop');
var history = require('./history');
var navObserver = require('./navigation-observer');

var currentSession = null;
var pendingDurationUpdate = false;
var globalMediaTitle = null;
var globalMediaIcon = null;

// --- Глобальные подписки (autoDestroy: false, один раз при загрузке модуля) ---

// Подписка на duration — срабатывает после probe
P.subscribe(P.global.media.current.metadata.duration, function(type, v1) {
    if (type === 'set' && v1 > 0 && currentSession && pendingDurationUpdate) {
        currentSession.duration = Number(v1) || 0;
        pendingDurationUpdate = false;
        // Обновляем title/icon из параллельных подписок
        if (globalMediaTitle && currentSession.title === 'Unknown') {
            currentSession.title = globalMediaTitle;
        }
        if (globalMediaIcon && !currentSession.icon) {
            currentSession.icon = globalMediaIcon;
        }
        history.record(currentSession, 0, currentSession.duration);
    }
}, { autoDestroy: false });

// Подписка на title — обновляет title для UPNP/torrent/local
P.subscribe(P.global.media.current.metadata.title, function(type, v1) {
    if (type === 'set' && v1) {
        globalMediaTitle = String(v1);
        if (currentSession && currentSession.title === 'Unknown') {
            currentSession.title = globalMediaTitle;
        }
    }
}, { autoDestroy: false });

// Подписка на icon
P.subscribe(P.global.media.current.metadata.icon, function(type, v1) {
    if (type === 'set' && v1) {
        globalMediaIcon = String(v1);
    }
}, { autoDestroy: false });

// --- Основная подписка на URL (старт/стоп) ---

P.subscribeValue(P.global.media.current.url, function(url) {
    var urlStr = url ? String(url) : null;

    if (!urlStr) {
        onPlaybackStop();
    } else {
        onPlaybackStart(urlStr);
    }
});

function onPlaybackStart(url) {
    if (currentSession && currentSession.url === url) return;

    var videoParams = navObserver.getLastVideoParams();
    var cachedDuration = navObserver.getLastCachedDuration();

    // Создаем сессию
    currentSession = {
        url: url,
        canonicalUrl: videoParams ? videoParams.canonicalUrl : url,
        title: videoParams ? videoParams.title : 'Unknown',
        icon: videoParams ? videoParams.icon : null,
        parentUrl: navObserver.getLastUrl(),
        startTime: Date.now(),
        duration: cachedDuration || 0
    };

    pendingDurationUpdate = (cachedDuration <= 0);

    history.record(currentSession, 0, currentSession.duration);
}

function onPlaybackStop() {
    if (!currentSession) return;

    var session = currentSession;
    currentSession = null;
    globalMediaTitle = null;
    globalMediaIcon = null;
    pendingDurationUpdate = false;

    // Читаем позицию из kvstore (150ms задержка)
    readRestartPos(session.canonicalUrl, function(position) {
        history.record(session, position, session.duration);
    });
}
```

### 12.3 Чтение Позиции (Restart Position)

```javascript
function readRestartPos(canonicalUrl, callback) {
    var metadata = require('native/metadata');
    
    // Создаем временный prop
    var tempProp = P.createRoot();
    
    // Привязываем playinfo
    metadata.bindPlayInfo(tempProp, canonicalUrl);
    
    // Ждем, пока Movian сохранит позицию
    setTimeout(function() {
        P.subscribeValue(tempProp.restartpos, function(seconds) {
            var position = seconds ? Number(seconds) : 0;
            
            // Очищаем
            P.destroy(tempProp);
            
            callback(position);
        });
    }, 150);
}
```

---

## 13. Отладка Props

### 13.1 Методы Отладки

**1. prop.print() (DevTools):**
```javascript
var P = require('movian/prop');

// Вывести всю структуру
P.print(P.global.navigators.current);

// Вывести конкретный prop
P.print(P.global.media.current.metadata);
```

**2. Перечисление Children:**
```javascript
var P = require('movian/prop');

// Получить список children
var children = P.global.navigators.current.enumerate();
console.log('Children:', children);
// → ["pages", "currentpage", "canGoBack", ...]
```

**3. Проверка Значений:**
```javascript
var P = require('movian/prop');

// Проверить разные пути
console.log('current.source:', 
    P.global.navigators.current.source);

console.log('currentpage.source:', 
    P.global.navigators.current.currentpage.source);

console.log('media.current.url:', 
    P.global.media.current.url);
```

**4. HTTP API (удаленная отладка):**
```bash
# Проверка prop через HTTP
GET http://movian-ip:42000/api/prop/global/navigators/current

# Включение debug
POST http://movian-ip:42000/api/prop/global/navigators/current
Content-Type: application/x-www-form-urlencoded

debug=on
```

### 13.2 DevTools Debug Script

```javascript
// devtools-debug.js
var P = require('movian/prop');

var debug = {
    timestamp: new Date().toISOString(),
    navigators: {},
    media: {}
};

// Navigators
try {
    var nav = P.global.navigators.current;
    debug.navigators.source = nav.source ? String(nav.source) : null;
    debug.navigators.currentpage_source = nav.currentpage.source ? 
        String(nav.currentpage.source) : null;
    debug.navigators.url = nav.url ? String(nav.url) : null;
} catch(e) {
    debug.navigators.error = e.message;
}

// Media
try {
    var media = P.global.media.current;
    debug.media.url = media.url ? String(media.url) : null;
    debug.media.title = media.metadata.title ? 
        String(media.metadata.title) : null;
    debug.media.duration = media.metadata.duration ? 
        Number(media.metadata.duration) : null;
} catch(e) {
    debug.media.error = e.message;
}

console.log('\n=== PROP DEBUG ===');
console.log(JSON.stringify(debug, null, 2));

// Для отображения в UI
P.global.dev.last_result = JSON.stringify(debug, null, 2);
```

### 13.3 Логирование в Плагине

```javascript
// log.js - простой logger
exports.d = function(msg) {
    if (enableDebug) {
        console.log(msg);
    }
};

// Использование в коде
log.d('[nav-observer] source=' + sourceStr.substring(0, 60));
log.d('[global-observer] Playback started: ' + url);
```

---

## Заключение

### Ключевые Моменты

1. **Prop System** - реактивная система свойств с подписками
2. **Иерархия** - дерево с `prop.global` в корне
3. **Подписки** - события при изменении значений
4. **Linking** - символические ссылки между props
5. **Thread-Safe** - многопоточная среда с синхронизацией
6. **HTTP API** - удаленный доступ через REST API

### Наш Фикс (Главное)

**Проблема:**
```javascript
// НЕ РАБОТАЕТ для UPNP
prop.global.navigators.current.currentpage.source
```

**Решение:**
```javascript
// РАБОТАЕТ для всех типов
prop.global.navigators.current.source
```

**Почему:** `currentpage` для UPNP указывает на папку (source=null), а `current` содержит videoparams.

### Полезные Ссылки

- **Prop Core:** `/home/dietpi/workspace/movian/src/prop/prop_core.c`
- **Prop HTTP:** `/home/dietpi/workspace/movian/src/prop/prop_http.c` ← HTTP API
- **Navigator:** `/home/dietpi/workspace/movian/src/navigator.c`
- **Media:** `/home/dietpi/workspace/movian/src/media/media.c`
- **JS Bindings:** `/home/dietpi/workspace/movian/src/ecmascript/es_prop.c`
- **Public API:** `/home/dietpi/workspace/movian/src/prop/prop.h`
- **Internal API:** `/home/dietpi/workspace/movian/src/prop/prop_i.h`

---

*Документация создана для плагина movian-watch-history*  
*Версия: 1.0 | Дата: 9 февраля 2026*
