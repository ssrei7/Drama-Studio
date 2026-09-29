/* 声稿 · 数据和配音稿规则
   顺序见 SPEC.md。未明确要求不要推送或部署。
   步骤：1 逐行编辑 2 资料和预设 3 生成 4 配音稿核对 5 导出 6 平台标签
*/
(function () {
  "use strict";

  var KEY = "shenggao.v1";
  var TIP_KEY = "shenggao.tip1";
  var SETTINGS_KEY = "shenggao.settings";
  var TEXT_LIMIT = 20000;
  var BUILTIN_STYLE_ID = "builtin-otome";
  var BUILTIN_SHORT_ID = "builtin-short";
  var BUILTIN_SERIAL_ID = "builtin-serial";
  var BUILTIN_PLATFORM_ID = "builtin-minimax";

  var TYPES = [
    { id: "dialogue", label: "对白", voice: true, placeholder: "写下要念的台词" },
    { id: "monologue", label: "独白", voice: true, placeholder: "写下心里的话" },
    { id: "narration", label: "旁白", voice: false, placeholder: "写下旁白，默认不进配音稿" },
    { id: "sfx", label: "音效", voice: false, placeholder: "写下音效，默认不进配音稿" },
    { id: "action", label: "动作", voice: false, placeholder: "写下动作，默认不进配音稿" }
  ];

  var PALETTE = ["#c23b22", "#c47b16", "#2f6f4e", "#1f5f8b", "#6b4c9a", "#a33b6b", "#3d6b8a", "#8a5a2b"];

  var STEPS = [
    { n: 1, state: "done", title: "逐行编辑", text: "导演本按行写。类型、说话人、要不要念、锁定。颜色跟着角色。配音稿能看基础结果。" },
    { n: 2, state: "done", title: "资料和预设", text: "导入 txt、docx 的角色卡和世界书。一个角色可绑多份世界书，一份世界书也可绑多个角色。出场角色可多选。用户人设全局生效，可切换。内置乙女向文风不可删，短篇小剧场和长篇分集只读，复制后才能改。" },
    { n: 3, state: "done", title: "生成", text: "短篇一次生成，长篇先确认各集标题和简介，再逐集或全部生成。生成稿单独保存，可改可删，可放进文件夹。采用时只替换没锁定的行。" },
    { n: 4, state: "done", title: "配音稿核对", text: "配音稿里可以临时勾掉一行。只影响这次预览和复制，不改导演本，也不进备份。刷新后恢复。" },
    { n: 5, state: "done", title: "导出", text: "导出前勾选格式。完整本 HTML、纯人声 TXT、按角色拆开的 ZIP。长篇可勾选音轨。项目备份仍走右上角。" },
    { n: 6, state: "done", title: "平台标签", text: "标签预设可导入、可切换。台词里用普通括号写标记名。导出时只替换纯人声和按角色拆开的文本。停顿范围每次随机。" }
  ];

  var db = null;
  var saveError = "";

  function uid() {
    try {
      if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    } catch (err) {}
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function typeId(id) {
    for (var i = 0; i < TYPES.length; i++) if (TYPES[i].id === id) return id;
    return "dialogue";
  }

  function typeMeta(id) {
    for (var i = 0; i < TYPES.length; i++) if (TYPES[i].id === id) return TYPES[i];
    return TYPES[0];
  }

  function safeColor(color) {
    return /^#[0-9a-fA-F]{6}$/.test(color || "") ? color : "#c23b22";
  }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function safeName(name) {
    var clean = String(name || "台本工作室").replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").trim();
    return clean || "台本工作室";
  }

  function formatTime(ts) {
    if (!ts) return "";
    try {
      return new Date(ts).toLocaleString("zh-CN", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch (err) {
      return "";
    }
  }

  function fresh() {
    return {
      version: 1,
      activeProjectId: null,
      projects: [],
      personas: [],
      activePersonaId: null,
      styles: [],
      activeStyleId: BUILTIN_STYLE_ID,
      structures: [],
      activeStructureId: BUILTIN_SHORT_ID,
      platforms: [],
      activePlatformId: null
    };
  }

  function builtinStyle() {
    return {
      id: BUILTIN_STYLE_ID,
      name: "乙女向广播剧",
      builtin: true,
      text: "乙女向广播剧。听众是第一视角，但不是说话人，没有听众自己的台词行。听众的反应和动作只写进说话人的反应和台词。亲密、慢热，对白多，有呼吸感。少上帝视角。不替听众做决定，不替听众说出心里话。不规定听众的称呼，名字和称呼都由正文自然出现。"
    };
  }

  function builtinStructures() {
    return [
      {
        id: BUILTIN_SHORT_ID,
        name: "短篇小剧场",
        builtin: true,
        kind: "short",
        text: "一次写完这一场，不要分集，不要写下一场预告。听众是第一视角，但不是说话人，不给听众写台词行。听众的反应和动作只通过说话人的反应和台词体现。名字用【】单独占一行，下一行起是台词。旁白、音效、动作、独白也用【】标出。情绪单独写成一行，以「情绪：」开头，不写进台词。不要替听众做决定，也不要替听众说出心里话。"
      },
      {
        id: BUILTIN_SERIAL_ID,
        name: "长篇分集",
        builtin: true,
        kind: "serial",
        text: "先按故事需要决定集数，通常 3 到 8 集，不要为了凑数拆得很碎。用户如果在这里写了集数或每集长度，就以用户写的为准。这是长篇中的一集，音轨就是一集。先保证这一集自己能听完，再和前后集衔接。听众是第一视角，但不是说话人，不给听众写台词行。听众的反应和动作只通过说话人的反应和台词体现。名字用【】单独占一行，下一行起是台词。旁白、音效、动作、独白也用【】标出。情绪单独写成一行，以「情绪：」开头，不写进台词。不要替听众做决定，也不要替听众说出心里话。"
      }
    ];
  }

  function clipText(value) {
    return String(value == null ? "" : value).slice(0, TEXT_LIMIT);
  }

  function sameName(a, b) {
    return String(a || "").trim() === String(b || "").trim();
  }

  function nameTaken(list, name, exceptId) {
    var clean = String(name || "").trim();
    if (!clean) return false;
    return list.some(function (item) {
      return item.id !== exceptId && sameName(item.name, clean);
    });
  }

  function duplicateNameError() {
    var err = new Error("已经有同名的了");
    err.code = "duplicate-name";
    return err;
  }

  function stripSecrets(project) {
    if (!project || typeof project !== "object") return;
    delete project.api;
    delete project.apiKey;
    delete project.key;
  }

  function freshProfile(partial) {
    var source = partial && typeof partial === "object" ? partial : {};
    return {
      id: source.id || uid(),
      name: String(source.name || "").slice(0, 32),
      baseUrl: String(source.baseUrl || "").trim().replace(/\/+$/, ""),
      model: String(source.model || "").trim().slice(0, 120),
      apiKey: String(source.apiKey || ""),
      models: Array.isArray(source.models) ? source.models.map(function (item) { return String(item || ""); }).filter(Boolean).slice(0, 300) : []
    };
  }

  function freshSettings() {
    var profile = freshProfile();
    return { profiles: [profile], activeProfileId: profile.id };
  }

  function loadSettings() {
    try {
      if (typeof localStorage === "undefined" || !localStorage.getItem) return freshSettings();
      var parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null") || {};
      if (!Array.isArray(parsed.profiles)) {
        var only = freshProfile(parsed);
        return { profiles: [only], activeProfileId: only.id };
      }
      var profiles = parsed.profiles.map(freshProfile);
      if (!profiles.length) return freshSettings();
      var active = profiles.some(function (item) { return item.id === parsed.activeProfileId; }) ? parsed.activeProfileId : profiles[0].id;
      return { profiles: profiles, activeProfileId: active };
    } catch (err) {
      return freshSettings();
    }
  }

  var settings = loadSettings();

  function activeProfile() {
    for (var i = 0; i < settings.profiles.length; i++) {
      if (settings.profiles[i].id === settings.activeProfileId) return settings.profiles[i];
    }
    return settings.profiles[0];
  }

  function writeSettings() {
    try {
      if (typeof localStorage !== "undefined" && localStorage.setItem) localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (err) {}
    return activeProfile();
  }

  function saveSettings(partial) {
    var profile = activeProfile();
    if (partial.baseUrl != null) profile.baseUrl = String(partial.baseUrl).trim().replace(/\/+$/, "");
    if (partial.model != null) profile.model = String(partial.model).trim().slice(0, 120);
    if (partial.apiKey != null) profile.apiKey = String(partial.apiKey);
    if (partial.models) profile.models = partial.models.slice(0, 300);
    return writeSettings();
  }

  function addProfile() {
    var profile = freshProfile();
    settings.profiles.push(profile);
    settings.activeProfileId = profile.id;
    writeSettings();
    return profile.id;
  }

  function useProfile(id) {
    if (!settings.profiles.some(function (item) { return item.id === id; })) return;
    settings.activeProfileId = id;
    writeSettings();
  }

  function setProfileName(id, name) {
    var clean = String(name || "").slice(0, 32);
    if (nameTaken(settings.profiles, clean, id)) throw duplicateNameError();
    settings.profiles.forEach(function (item) { if (item.id === id) item.name = clean; });
    writeSettings();
  }

  function deleteProfile(id) {
    if (settings.profiles.length <= 1) return false;
    settings.profiles = settings.profiles.filter(function (item) { return item.id !== id; });
    if (settings.activeProfileId === id) settings.activeProfileId = settings.profiles[0].id;
    writeSettings();
    return true;
  }

  function normalizeProject(project) {
    if (!project.id) project.id = uid();
    project.name = String(project.name || "未命名广播剧");
    if (!project.createdAt) project.createdAt = Date.now();
    if (!project.updatedAt) project.updatedAt = project.createdAt;
    if (typeof project.includeMonologue !== "boolean") project.includeMonologue = true;
    if (!Array.isArray(project.characters)) project.characters = [];
    if (!Array.isArray(project.lines)) project.lines = [];
    if (!Array.isArray(project.books)) project.books = [];
    if (!Array.isArray(project.cast)) project.cast = [];
    if (!Array.isArray(project.castNames)) project.castNames = [];
    project.corePrompt = clipText(project.corePrompt);
    project.storyPrompt = clipText(project.storyPrompt);
    project.mode = project.mode === "serial" ? "serial" : project.mode === "short" ? "short" : "";
    if (!Array.isArray(project.episodes)) project.episodes = [];
    if (!Array.isArray(project.drafts)) project.drafts = [];
    if (!Array.isArray(project.folders)) project.folders = [];
    project.characters.forEach(function (character) {
      if (!character.id) character.id = uid();
      character.name = String(character.name || "").slice(0, 32);
      character.color = safeColor(character.color);
      character.body = clipText(character.body);
      if (!Array.isArray(character.bookIds)) character.bookIds = [];
    });
    project.books.forEach(function (book) {
      if (!book.id) book.id = uid();
      book.name = String(book.name || "").slice(0, 32);
      book.body = clipText(book.body);
    });
    var bookIds = {};
    project.books.forEach(function (book) { bookIds[book.id] = true; });
    project.characters.forEach(function (character) {
      character.bookIds = character.bookIds.filter(function (id) { return bookIds[id]; });
    });
    project.lines.forEach(function (line) { normalizeLine(line, {}); });
    project.episodes.forEach(function (episode) { normalizeEpisode(episode, {}); });
    if (!project.episodes.some(function (episode) { return episode.id === project.activeEpisodeId; })) {
      project.activeEpisodeId = project.episodes[0] ? project.episodes[0].id : "";
    }
    var folderIds = { "": true };
    project.folders.forEach(function (folder) {
      if (!folder.id) folder.id = uid();
      folder.name = String(folder.name || "").slice(0, 32);
      folderIds[folder.id] = true;
    });
    project.drafts.forEach(function (draft) {
      if (!draft.id) draft.id = uid();
      draft.name = String(draft.name || "").slice(0, 40);
      draft.folderId = folderIds[draft.folderId] ? draft.folderId : "";
      draft.raw = clipText(draft.raw);
      draft.parsed = draft.parsed !== false;
      if (!Array.isArray(draft.lines)) draft.lines = [];
      draft.lines.forEach(function (line) { normalizeLine(line, ids); });
      if (!draft.createdAt) draft.createdAt = Date.now();
    });
    return project;
  }

  function normalizePersona(persona) {
    if (!persona.id) persona.id = uid();
    persona.name = String(persona.name || "").slice(0, 32);
    persona.body = clipText(persona.body);
    return persona;
  }

  function normalizeStyle(style) {
    if (!style.id) style.id = uid();
    style.name = String(style.name || "").slice(0, 32);
    style.builtin = !!style.builtin;
    style.text = clipText(style.text);
    return style;
  }

  function normalizeStructure(structure) {
    if (!structure.id) structure.id = uid();
    structure.name = String(structure.name || "").slice(0, 32);
    structure.builtin = !!structure.builtin;
    structure.kind = structure.kind === "serial" ? "serial" : "short";
    structure.text = clipText(structure.text);
    return structure;
  }

  function normalizeLine(line, ids) {
    if (!line.id) line.id = uid();
    line.type = typeId(line.type);
    line.speakerId = line.speakerId && ids[line.speakerId] ? line.speakerId : "";
    line.text = String(line.text || "");
    line.emotion = String(line.emotion || "").slice(0, 24);
    line.inVoice = !!line.inVoice;
    line.locked = !!line.locked;
    return line;
  }

  function normalizeEpisode(episode, ids) {
    if (!episode.id) episode.id = uid();
    episode.title = String(episode.title || "").slice(0, 40);
    episode.summary = clipText(episode.summary);
    if (!Array.isArray(episode.lines)) episode.lines = [];
    episode.lines.forEach(function (line) { normalizeLine(line, ids); });
    return episode;
  }

  function collectLibrary() {
    if (!Array.isArray(db.characters)) db.characters = [];
    if (!Array.isArray(db.books)) db.books = [];
    var names = {};
    db.characters.forEach(function (item) { if (item.name) names[item.name] = item.id; });
    db.projects.forEach(function (project) {
      var oldBooks = {};
      (project.books || []).forEach(function (book) {
        var existing = db.books.filter(function (item) { return item.name && item.name === book.name; })[0];
        var target = existing || book;
        if (!existing) db.books.push(book);
        oldBooks[book.id] = target.id;
      });
      (project.characters || []).forEach(function (character) {
        character.bookIds = (character.bookIds || []).map(function (id) { return oldBooks[id] || id; });
        var existing = character.name ? db.characters.filter(function (item) { return item.name === character.name; })[0] : null;
        if (!existing) {
          db.characters.push(character);
          if (character.name) names[character.name] = character.id;
        }
      });
      project.castNames = (project.cast || []).map(function (id) {
        var found = (project.characters || []).filter(function (item) { return item.id === id; })[0];
        return found ? found.name : "";
      }).filter(Boolean);
      project.lines.concat((project.episodes || []).reduce(function (all, episode) { return all.concat(episode.lines || []); }, [])).forEach(function (line) {
        var found = (project.characters || []).filter(function (item) { return item.id === line.speakerId; })[0];
        if (found && names[found.name]) line.speakerId = names[found.name];
      });
      delete project.characters;
      delete project.books;
      delete project.cast;
    });
    db.characters.forEach(function (character) {
      if (!character.id) character.id = uid();
      character.name = String(character.name || "").slice(0, 32);
      character.color = safeColor(character.color);
      character.body = clipText(character.body);
      if (!Array.isArray(character.bookIds)) character.bookIds = [];
    });
    db.books.forEach(function (book) {
      if (!book.id) book.id = uid();
      book.name = String(book.name || "").slice(0, 32);
      book.body = clipText(book.body);
    });
    var bookIds = {};
    db.books.forEach(function (book) { bookIds[book.id] = true; });
    db.characters.forEach(function (character) {
      character.bookIds = character.bookIds.filter(function (id) { return bookIds[id]; });
    });
    var characterIds = {};
    db.characters.forEach(function (character) { characterIds[character.id] = true; });
    db.projects.forEach(function (project) {
      project.cast = project.castNames.map(function (name) { return names[name]; }).filter(function (id) { return characterIds[id]; });
      project.lines.forEach(function (line) { if (!characterIds[line.speakerId]) line.speakerId = ""; });
      project.episodes.forEach(function (episode) {
        episode.lines.forEach(function (line) { if (!characterIds[line.speakerId]) line.speakerId = ""; });
      });
    });
  }

  function ensureLibraries() {
    collectLibrary();
    if (!Array.isArray(db.personas)) db.personas = [];
    if (!Array.isArray(db.styles)) db.styles = [];
    if (!Array.isArray(db.structures)) db.structures = [];
    db.personas.forEach(normalizePersona);
    var style = builtinStyle();
    var foundStyle = false;
    db.styles.forEach(function (item) {
      normalizeStyle(item);
      if (item.id === BUILTIN_STYLE_ID) {
        item.name = style.name;
        item.builtin = true;
        item.text = style.text;
        foundStyle = true;
      }
    });
    if (!foundStyle) db.styles.unshift(style);
    var builtins = builtinStructures();
    builtins.forEach(function (builtin) {
      var found = false;
      db.structures.forEach(function (item) {
        if (item.id === builtin.id) {
          item.name = builtin.name;
          item.builtin = true;
          item.kind = builtin.kind;
          item.text = builtin.text;
          found = true;
        }
      });
      if (!found) db.structures.push(builtin);
    });
    db.structures.forEach(normalizeStructure);
    if (!db.personas.some(function (item) { return item.id === db.activePersonaId; })) {
      db.activePersonaId = db.personas[0] ? db.personas[0].id : null;
    }
    if (!db.styles.some(function (item) { return item.id === db.activeStyleId; })) {
      db.activeStyleId = BUILTIN_STYLE_ID;
    }
    if (!db.structures.some(function (item) { return item.id === db.activeStructureId; })) {
      db.activeStructureId = BUILTIN_SHORT_ID;
    }
    if (!Array.isArray(db.platforms)) db.platforms = [];
    var builtinRows = parsePlatform(builtinPlatformText());
    var foundPlatform = false;
    db.platforms.forEach(function (item) {
      if (!item.id) item.id = uid();
      item.name = String(item.name || "").slice(0, 32);
      item.builtin = !!item.builtin;
      if (!Array.isArray(item.rows)) item.rows = [];
      if (item.id === BUILTIN_PLATFORM_ID) {
        item.name = "MiniMax";
        item.builtin = true;
        item.rows = builtinRows;
        foundPlatform = true;
      }
    });
    if (!foundPlatform) db.platforms.unshift({ id: BUILTIN_PLATFORM_ID, name: "MiniMax", builtin: true, rows: builtinRows });
    if (!db.platforms.some(function (item) { return item.id === db.activePlatformId; })) {
      db.activePlatformId = db.platforms[0] ? db.platforms[0].id : null;
    }
  }

  function builtinPlatformText() {
    return [
      "轻笑 (chuckle)",
      "轻咳 (coughs lightly)",
      "喘气 (pant)",
      "吸气 (inhale)",
      "呼气 (exhale)",
      "倒吸气 (gasps)",
      "吸鼻子 (sniff)",
      "叹气 (sigh)",
      "倒吸气 (gasp)",
      "呻吟 (groan)",
      "咳嗽 (cough)",
      "清嗓子 (clears throat)",
      "咕哝 (murmur)",
      "抽泣 (crying loudly)",
      "呼气 (exhale sharply)",
      "笑 (chuckle)",
      "喘息 (pant)",
      "抽泣 (sobbing)",
      "哭腔 (crying)",
      "掌声 (applause)",
      "停一下 <#0.2-0.6#>"
    ].join("\n");
  }

  function platformTemplate() {
    return "轻笑 (chuckle)\n叹气 (sigh)\n停一下 <#0.2-0.6#>";
  }

  function parsePlatform(text) {
    var rows = [];
    String(text || "").replace(/\r\n?/g, "\n").split("\n").forEach(function (row) {
      var clean = row.trim();
      if (!clean || clean.charAt(0) === "#") return;
      var parts = clean.split(/\s+|[|｜]/);
      if (parts.length < 2) return;
      var name = parts.shift().trim();
      var mark = parts.join("").trim();
      if (name && mark) rows.push({ name: name.slice(0, 32), mark: mark.slice(0, 80) });
    });
    return rows;
  }

  function activePlatform() {
    for (var i = 0; i < db.platforms.length; i++) {
      if (db.platforms[i].id === db.activePlatformId) return db.platforms[i];
    }
    return null;
  }

  function savePlatform(name, text, replaceId) {
    var rows = parsePlatform(text);
    if (!rows.length) throw new Error("没有认出标签");
    if (replaceId === BUILTIN_PLATFORM_ID) throw new Error("内置预设不能替换");
    if (replaceId) {
      for (var i = 0; i < db.platforms.length; i++) {
        if (db.platforms[i].id === replaceId) {
          if (nameTaken(db.platforms, name, replaceId)) throw duplicateNameError();
          db.platforms[i].name = String(name || "").slice(0, 32);
          db.platforms[i].rows = rows;
          db.activePlatformId = replaceId;
          persist();
          return replaceId;
        }
      }
    }
    if (nameTaken(db.platforms, name, "")) throw duplicateNameError();
    var platform = { id: uid(), name: String(name || "").slice(0, 32), rows: rows };
    db.platforms.push(platform);
    db.activePlatformId = platform.id;
    persist();
    return platform.id;
  }

  function deletePlatform(id) {
    var target = null;
    db.platforms.forEach(function (item) { if (item.id === id) target = item; });
    if (!target || target.builtin) return false;
    db.platforms = db.platforms.filter(function (item) { return item.id !== id; });
    if (db.activePlatformId === id) db.activePlatformId = db.platforms[0] ? db.platforms[0].id : null;
    persist();
    return true;
  }

  function duplicatePlatform(id) {
    var source = null;
    db.platforms.forEach(function (item) { if (item.id === id) source = item; });
    if (!source) return "";
    var copy = { id: uid(), name: "", builtin: false, rows: source.rows.map(function (row) { return { name: row.name, mark: row.mark }; }) };
    db.platforms.push(copy);
    db.activePlatformId = copy.id;
    persist();
    return copy.id;
  }

  function setPlatformText(id, text) {
    for (var i = 0; i < db.platforms.length; i++) {
      if (db.platforms[i].id === id) {
        if (db.platforms[i].builtin) return;
        var rows = parsePlatform(text);
        if (!rows.length) return;
        db.platforms[i].rows = rows;
        persist();
        return;
      }
    }
  }

  function setPlatformName(id, name) {
    var target = null;
    db.platforms.forEach(function (item) { if (item.id === id) target = item; });
    if (!target || target.builtin) return;
    if (renameChecked(db.platforms, id, name, function (item, clean) { item.name = clean; })) persist();
  }

  function usePlatform(id) {
    if (!db.platforms.some(function (item) { return item.id === id; })) return;
    db.activePlatformId = id;
    persist();
  }

  function randomPause(mark, random) {
    var roll = random || Math.random;
    return String(mark || "").replace(/<#\s*(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*#>/g, function (_, low, high) {
      var a = Math.max(0.01, Math.min(99.99, Number(low)));
      var b = Math.max(0.01, Math.min(99.99, Number(high)));
      if (a > b) { var swap = a; a = b; b = swap; }
      var value = Math.round((a + (b - a) * roll()) * 100) / 100;
      return "<#" + value.toFixed(2) + "#>";
    });
  }

  function applyPlatform(text, platform, random) {
    var rows = platform && platform.rows ? platform.rows : [];
    var map = {};
    rows.forEach(function (row) { map[row.name] = row.mark; });
    return String(text || "").replace(/[（(]([^()（）\n]{1,32})[）)]/g, function (all, name) {
      if (!Object.prototype.hasOwnProperty.call(map, name)) return "";
      return randomPause(map[name], random);
    });
  }

  function load() {
    var data = fresh();
    var raw = null;
    try {
      if (typeof localStorage === "undefined" || !localStorage.getItem) {
        db = data;
        ensureLibraries();
        return db;
      }
      raw = localStorage.getItem(KEY);
    } catch (err) {
      db = data;
      ensureLibraries();
      return db;
    }
    if (!raw) {
      db = data;
      ensureLibraries();
      return db;
    }
    try {
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.projects)) {
        db = data;
        ensureLibraries();
        return db;
      }
      parsed.version = parsed.version || 1;
      parsed.projects.forEach(normalizeProject);
      if (!parsed.projects.some(function (project) { return project.id === parsed.activeProjectId; })) {
        parsed.activeProjectId = parsed.projects[0] ? parsed.projects[0].id : null;
      }
      db = parsed;
      ensureLibraries();
      return db;
    } catch (err) {
      try { localStorage.setItem(KEY + ".corrupt", raw); } catch (ignore) {}
      db = data;
      ensureLibraries();
      return db;
    }
  }

  function current() {
    for (var i = 0; i < db.projects.length; i++) {
      if (db.projects[i].id === db.activeProjectId) {
        var project = db.projects[i];
        project.characters = db.characters;
        project.books = db.books;
        return project;
      }
    }
    return null;
  }

  function persist() {
    try {
      var copy = JSON.parse(JSON.stringify(db));
      copy.projects.forEach(function (project) {
        delete project.characters;
        delete project.books;
      });
      localStorage.setItem(KEY, JSON.stringify(copy));
      saveError = "";
    } catch (err) {
      saveError = "没能保存在这台设备上";
    }
  }

  function touch() {
    var project = current();
    if (project) project.updatedAt = Date.now();
    persist();
  }

  function blankProject(name) {
    return {
      id: uid(),
      name: name || "未命名广播剧",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      includeMonologue: true,
      characters: [],
      lines: []
    };
  }

  function newLine(partial) {
    partial = partial || {};
    var type = typeId(partial.type);
    var meta = typeMeta(type);
    return {
      id: partial.id || uid(),
      type: type,
      speakerId: partial.speakerId || "",
      text: partial.text || "",
      emotion: partial.emotion || "",
      inVoice: hasOwn(partial, "inVoice") ? !!partial.inVoice : !!meta.voice,
      locked: !!partial.locked
    };
  }

  function createDemo() {
    var project = blankProject("末班之后");
    var lin = uid();
    var zhou = uid();
    project.characters = [
      { id: lin, name: "林夏", color: "#9c3b2e" },
      { id: zhou, name: "周屿", color: "#1f5f8b" }
    ];
    var rows = [
      ["sfx", "", "雨声，由疏到密。便利店门上的风铃。", ""],
      ["narration", "", "夜班公交已经停了。玻璃上全是水，店里只剩热水机的灯。", ""],
      ["action", "", "林夏推开门，在门口停了一下。", ""],
      ["dialogue", lin, "你还没走。", ""],
      ["sfx", "", "风铃又响了一下。", ""],
      ["dialogue", lin, "我以为末班车会在路口等。", ""],
      ["dialogue", zhou, "末班二十分钟前就走了。", "平淡"],
      ["monologue", lin, "他没问我为什么这个时候才来。这样也好。", "放轻"],
      ["sfx", "", "热水倒进纸杯。", ""],
      ["dialogue", zhou, "先喝这个。", ""],
      ["narration", "", "纸杯很烫。两个人一时都没说话。", ""],
      ["dialogue", lin, "明天最早一班是五点。", ""],
      ["dialogue", lin, "你要是也去车站，我们可以一起等。", ""]
    ];
    project.lines = rows.map(function (row) {
      return newLine({ type: row[0], speakerId: row[1], text: row[2], emotion: row[3] });
    });
    return project;
  }

  function addProject(project) {
    normalizeProject(project);
    db.projects.unshift(project);
    db.activeProjectId = project.id;
    persist();
    return project.id;
  }

  function listProjects() {
    return db.projects.slice().sort(function (a, b) {
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
  }

  function deleteProject(id) {
    db.projects = db.projects.filter(function (project) { return project.id !== id; });
    if (db.activeProjectId === id) db.activeProjectId = db.projects[0] ? db.projects[0].id : null;
    touch();
  }

  function openProject(id) {
    if (!db.projects.some(function (project) { return project.id === id; })) return;
    db.activeProjectId = id;
    persist();
  }

  function rename(name) {
    var project = current();
    if (!project) return;
    project.name = String(name || "").slice(0, 40);
    touch();
  }

  function setIncludeMonologue(value) {
    var project = current();
    if (!project) return;
    project.includeMonologue = !!value;
    touch();
  }

  function lineList() {
    var project = current();
    if (!project) return null;
    if (project.mode === "serial") {
      var episode = activeEpisode(project);
      return episode ? episode.lines : [];
    }
    return project.lines;
  }

  function findLine(id) {
    var lines = lineList();
    if (!lines) return null;
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].id === id) return lines[i];
    }
    return null;
  }

  function speakerNear(project, index) {
    var lines = lineList() || [];
    for (var i = index; i >= 0; i--) {
      var line = lines[i];
      if ((line.type === "dialogue" || line.type === "monologue") && line.speakerId) return line.speakerId;
    }
    return project.characters[0] ? project.characters[0].id : "";
  }

  function insertAfter(id) {
    var project = current();
    if (!project) return "";
    var lines = lineList();
    var index = lines.length - 1;
    if (id) {
      var found = -1;
      for (var i = 0; i < lines.length; i++) {
        if (lines[i].id === id) found = i;
      }
      if (found >= 0) index = found;
    }
    var line = newLine({ type: "dialogue", speakerId: speakerNear(project, index) });
    if (!id) lines.push(line);
    else lines.splice(index + 1, 0, line);
    touch();
    return line.id;
  }

  function deleteLine(id) {
    var project = current();
    if (!project) return;
    var lines = lineList();
    var next = lines.filter(function (line) { return line.id !== id; });
    lines.length = 0;
    next.forEach(function (line) { lines.push(line); });
    touch();
  }

  function moveItem(list, id, dir) {
    var i = -1;
    for (var n = 0; n < list.length; n++) if (list[n].id === id) i = n;
    var j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return false;
    var item = list.splice(i, 1)[0];
    list.splice(j, 0, item);
    return true;
  }

  function moveLine(id, dir) {
    var project = current();
    if (!project) return;
    if (moveItem(lineList(), id, dir)) touch();
  }

  function toggleVoice(id) {
    var line = findLine(id);
    if (!line) return;
    line.inVoice = !line.inVoice;
    touch();
  }

  function toggleLock(id) {
    var line = findLine(id);
    if (!line) return;
    line.locked = !line.locked;
    touch();
  }

  function setText(id, text) {
    var line = findLine(id);
    if (!line) return;
    line.text = text;
    touch();
  }

  function setEmotion(id, text) {
    var line = findLine(id);
    if (!line) return;
    line.emotion = String(text || "").slice(0, 24);
    touch();
  }

  function setLineType(id, type) {
    var line = findLine(id);
    if (!line) return;
    var meta = typeMeta(type);
    line.type = meta.id;
    line.inVoice = !!meta.voice;
    touch();
  }

  function setSpeaker(id, speakerId) {
    var line = findLine(id);
    var project = current();
    if (!line || !project) return;
    var ok = speakerId && db.characters.some(function (character) { return character.id === speakerId; });
    line.speakerId = ok ? speakerId : "";
    touch();
  }

  function addCharacter() {
    var character = {
      id: uid(),
      name: "",
      color: PALETTE[db.characters.length % PALETTE.length],
      body: "",
      bookIds: []
    };
    db.characters.push(character);
    persist();
    return character.id;
  }

  function deleteCharacter(id) {
    db.characters = db.characters.filter(function (character) { return character.id !== id; });
    db.projects.forEach(function (project) {
      project.cast = (project.cast || []).filter(function (item) { return item !== id; });
      project.lines.forEach(function (line) { if (line.speakerId === id) line.speakerId = ""; });
      project.episodes.forEach(function (episode) {
        episode.lines.forEach(function (line) { if (line.speakerId === id) line.speakerId = ""; });
      });
    });
    persist();
  }

  function setCharacterName(id, name) {
    var clean = String(name || "").slice(0, 32);
    if (nameTaken(db.characters, clean, id)) throw duplicateNameError();
    db.characters.forEach(function (item) { if (item.id === id) item.name = clean; });
    persist();
  }

  function setCharacterColor(id, color) {
    if (!/^#[0-9a-fA-F]{6}$/.test(color || "")) return;
    db.characters.forEach(function (item) { if (item.id === id) item.color = color; });
    persist();
  }

  function setCharacterBody(id, body) {
    db.characters.forEach(function (item) { if (item.id === id) item.body = clipText(body); });
    persist();
  }

  function renameChecked(list, id, name, apply) {
    var clean = String(name || "").slice(0, 32);
    if (nameTaken(list, clean, id)) throw duplicateNameError();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        apply(list[i], clean);
        return true;
      }
    }
    return false;
  }

  function setCharacterNameChecked(id, name) {
    if (renameChecked(db.characters, id, name, function (item, clean) { item.name = clean; })) persist();
  }

  function addBook() {
    var book = { id: uid(), name: "", body: "" };
    db.books.push(book);
    persist();
    return book.id;
  }

  function deleteBook(id) {
    db.books = db.books.filter(function (book) { return book.id !== id; });
    db.characters.forEach(function (character) {
      character.bookIds = character.bookIds.filter(function (bookId) { return bookId !== id; });
    });
    persist();
  }

  function setBookName(id, name) {
    if (renameChecked(db.books, id, name, function (item, clean) { item.name = clean; })) persist();
  }

  function setBookBody(id, body) {
    db.books.forEach(function (item) { if (item.id === id) item.body = clipText(body); });
    persist();
  }

  function toggleBookLink(characterId, bookId) {
    var character = db.characters.filter(function (item) { return item.id === characterId; })[0];
    if (!character || !db.books.some(function (item) { return item.id === bookId; })) return;
    var index = character.bookIds.indexOf(bookId);
    if (index >= 0) character.bookIds.splice(index, 1);
    else character.bookIds.push(bookId);
    persist();
  }

  function toggleCast(characterId) {
    var project = current();
    if (!project || !db.characters.some(function (item) { return item.id === characterId; })) return;
    var index = project.cast.indexOf(characterId);
    if (index >= 0) project.cast.splice(index, 1);
    else project.cast.push(characterId);
    project.castNames = project.cast.map(function (id) {
      var found = db.characters.filter(function (item) { return item.id === id; })[0];
      return found ? found.name : "";
    }).filter(Boolean);
    touch();
  }

  function importMaterial(kind, body, name) {
    var text = clipText(body);
    var title = String(name || "").replace(/\.(txt|docx)$/i, "").slice(0, 32);
    var list = kind === "book" ? db.books : db.characters;
    if (nameTaken(list, title, "")) throw duplicateNameError();
    if (kind === "book") {
      var book = { id: uid(), name: title, body: text };
      db.books.push(book);
      persist();
      return book.id;
    }
    var character = {
      id: uid(),
      name: title,
      color: PALETTE[db.characters.length % PALETTE.length],
      body: text,
      bookIds: []
    };
    db.characters.push(character);
    persist();
    return character.id;
  }

  function addPersona() {
    var persona = { id: uid(), name: "", body: "" };
    db.personas.push(persona);
    db.activePersonaId = persona.id;
    persist();
    return persona.id;
  }

  function deletePersona(id) {
    db.personas = db.personas.filter(function (item) { return item.id !== id; });
    if (db.activePersonaId === id) db.activePersonaId = db.personas[0] ? db.personas[0].id : null;
    persist();
  }

  function setPersonaName(id, name) {
    if (renameChecked(db.personas, id, name, function (item, clean) { item.name = clean; })) persist();
  }

  function setPersonaBody(id, body) {
    for (var i = 0; i < db.personas.length; i++) {
      if (db.personas[i].id === id) {
        db.personas[i].body = clipText(body);
        persist();
        return;
      }
    }
  }

  function usePersona(id) {
    if (!db.personas.some(function (item) { return item.id === id; })) return;
    db.activePersonaId = id;
    persist();
  }

  function importPersona(body) {
    var persona = { id: uid(), name: "", body: clipText(body) };
    db.personas.push(persona);
    db.activePersonaId = persona.id;
    persist();
    return persona.id;
  }

  function activePersona() {
    for (var i = 0; i < db.personas.length; i++) {
      if (db.personas[i].id === db.activePersonaId) return db.personas[i];
    }
    return null;
  }

  function addStyle() {
    var style = { id: uid(), name: "", builtin: false, text: "" };
    db.styles.push(style);
    db.activeStyleId = style.id;
    persist();
    return style.id;
  }

  function duplicateStyle(id) {
    var source = null;
    db.styles.forEach(function (item) { if (item.id === id) source = item; });
    if (!source) return "";
    var copy = { id: uid(), name: "", builtin: false, text: source.text };
    db.styles.push(copy);
    db.activeStyleId = copy.id;
    persist();
    return copy.id;
  }

  function deleteStyle(id) {
    var target = null;
    db.styles.forEach(function (item) { if (item.id === id) target = item; });
    if (!target || target.builtin) return false;
    db.styles = db.styles.filter(function (item) { return item.id !== id; });
    if (db.activeStyleId === id) db.activeStyleId = BUILTIN_STYLE_ID;
    persist();
    return true;
  }

  function setStyleName(id, name) {
    var target = null;
    db.styles.forEach(function (item) { if (item.id === id) target = item; });
    if (!target || target.builtin) return;
    if (renameChecked(db.styles, id, name, function (item, clean) { item.name = clean; })) persist();
  }

  function setStyleText(id, text) {
    for (var i = 0; i < db.styles.length; i++) {
      if (db.styles[i].id === id) {
        if (db.styles[i].builtin) return;
        db.styles[i].text = clipText(text);
        persist();
        return;
      }
    }
  }

  function useStyle(id) {
    if (!db.styles.some(function (item) { return item.id === id; })) return;
    db.activeStyleId = id;
    persist();
  }

  function addStructure() {
    var structure = { id: uid(), name: "", builtin: false, kind: "short", text: "" };
    db.structures.push(structure);
    db.activeStructureId = structure.id;
    persist();
    return structure.id;
  }

  function duplicateStructure(id) {
    var source = null;
    db.structures.forEach(function (item) { if (item.id === id) source = item; });
    if (!source) return "";
    var copy = { id: uid(), name: "", builtin: false, kind: source.kind === "serial" ? "serial" : "short", text: source.text };
    db.structures.push(copy);
    db.activeStructureId = copy.id;
    persist();
    return copy.id;
  }

  function deleteStructure(id) {
    var target = null;
    db.structures.forEach(function (item) { if (item.id === id) target = item; });
    if (!target || target.builtin) return false;
    db.structures = db.structures.filter(function (item) { return item.id !== id; });
    if (db.activeStructureId === id) db.activeStructureId = BUILTIN_SHORT_ID;
    persist();
    return true;
  }

  function setStructureName(id, name) {
    var target = null;
    db.structures.forEach(function (item) { if (item.id === id) target = item; });
    if (!target || target.builtin) return;
    if (renameChecked(db.structures, id, name, function (item, clean) { item.name = clean; })) persist();
  }

  function setStructureKind(id, kind) {
    for (var i = 0; i < db.structures.length; i++) {
      if (db.structures[i].id === id) {
        if (db.structures[i].builtin) return;
        db.structures[i].kind = kind === "serial" ? "serial" : "short";
        persist();
        return;
      }
    }
  }

  function setStructureText(id, text) {
    for (var i = 0; i < db.structures.length; i++) {
      if (db.structures[i].id === id) {
        if (db.structures[i].builtin) return;
        db.structures[i].text = clipText(text);
        persist();
        return;
      }
    }
  }

  function useStructure(id) {
    if (!db.structures.some(function (item) { return item.id === id; })) return;
    db.activeStructureId = id;
    persist();
  }

  function activeStructure() {
    for (var i = 0; i < db.structures.length; i++) {
      if (db.structures[i].id === db.activeStructureId) return db.structures[i];
    }
    return builtinStructures()[0];
  }

  function activeStyle() {
    for (var i = 0; i < db.styles.length; i++) {
      if (db.styles[i].id === db.activeStyleId) return db.styles[i];
    }
    return builtinStyle();
  }

  function activeEpisode(project) {
    var target = project || current();
    if (!target) return null;
    for (var i = 0; i < target.episodes.length; i++) {
      if (target.episodes[i].id === target.activeEpisodeId) return target.episodes[i];
    }
    return target.episodes[0] || null;
  }

  function workingLines(project) {
    if (project.mode === "serial") {
      var episode = activeEpisode(project);
      return episode ? episode.lines : [];
    }
    return project.lines;
  }

  function setCorePrompt(text) {
    var project = current();
    if (!project) return;
    project.corePrompt = clipText(text);
    touch();
  }

  function setStoryPrompt(text) {
    var project = current();
    if (!project) return;
    project.storyPrompt = clipText(text);
    touch();
  }

  function setEpisodeTitle(id, title) {
    var project = current();
    if (!project) return;
    project.episodes.forEach(function (episode) {
      if (episode.id === id) episode.title = String(title || "").slice(0, 40);
    });
    touch();
  }

  function setEpisodeSummary(id, summary) {
    var project = current();
    if (!project) return;
    project.episodes.forEach(function (episode) {
      if (episode.id === id) episode.summary = clipText(summary);
    });
    touch();
  }

  function openEpisode(id) {
    var project = current();
    if (!project || !project.episodes.some(function (episode) { return episode.id === id; })) return;
    project.activeEpisodeId = id;
    touch();
  }

  function addFolder() {
    var project = current();
    if (!project) return "";
    var folder = { id: uid(), name: "" };
    project.folders.push(folder);
    touch();
    return folder.id;
  }

  function setFolderName(id, name) {
    var project = current();
    if (!project) return;
    if (renameChecked(project.folders, id, name, function (item, clean) { item.name = clean; })) touch();
  }

  function deleteFolder(id) {
    var project = current();
    if (!project) return;
    project.folders = project.folders.filter(function (folder) { return folder.id !== id; });
    project.drafts.forEach(function (draft) {
      if (draft.folderId === id) draft.folderId = "";
    });
    touch();
  }

  function moveDraft(id, folderId) {
    var project = current();
    if (!project) return;
    var ok = !folderId || project.folders.some(function (folder) { return folder.id === folderId; });
    project.drafts.forEach(function (draft) {
      if (draft.id === id) draft.folderId = ok ? folderId || "" : "";
    });
    touch();
  }

  function setDraftName(id, name) {
    var project = current();
    if (!project) return;
    if (renameChecked(project.drafts, id, name, function (item, clean) { item.name = clean; })) touch();
  }

  function setDraftText(id, index, text) {
    var project = current();
    if (!project) return;
    project.drafts.forEach(function (draft) {
      if (draft.id === id && draft.lines[index]) {
        draft.lines[index].text = String(text || "");
        draft.parsed = true;
      }
    });
    touch();
  }

  function deleteDraftLine(id, index) {
    var project = current();
    if (!project) return;
    project.drafts.forEach(function (draft) {
      if (draft.id === id) draft.lines.splice(index, 1);
    });
    touch();
  }

  function deleteDraft(id) {
    var project = current();
    if (!project) return;
    project.drafts = project.drafts.filter(function (draft) { return draft.id !== id; });
    touch();
  }

  function findOrCreateSpeaker(project, name, kind) {
    var clean = String(name || "").trim().slice(0, 32);
    if (!clean || kind !== "dialogue") return "";
    for (var i = 0; i < db.characters.length; i++) {
      if (sameName(db.characters[i].name, clean)) return db.characters[i].id;
    }
    var character = {
      id: uid(),
      name: clean,
      color: PALETTE[db.characters.length % PALETTE.length],
      body: "",
      bookIds: []
    };
    db.characters.push(character);
    return character.id;
  }

  function markerKind(label) {
    if (label === "旁白") return "narration";
    if (label === "音效") return "sfx";
    if (label === "动作") return "action";
    if (label === "独白") return "monologue";
    return "dialogue";
  }

  function parseScript(text) {
    var rows = String(text || "").replace(/\r\n?/g, "\n").split("\n");
    var lines = [];
    var current = null;
    var sawMarker = false;
    function push() {
      if (!current) return;
      current.text = current.text.replace(/^\n+|\n+$/g, "");
      if (current.text || current.emotion) lines.push(current);
      current = null;
    }
    rows.forEach(function (row) {
      var marker = row.trim().match(/^【([^】]{1,32})】$/);
      var emotion = row.trim().match(/^情绪[:：]\s*(.*)$/);
      if (marker) {
        sawMarker = true;
        push();
        current = { label: marker[1].trim(), kind: markerKind(marker[1].trim()), text: "", emotion: "" };
        return;
      }
      if (!current) return;
      if (emotion) {
        current.emotion = emotion[1].trim().slice(0, 24);
        return;
      }
      current.text += (current.text ? "\n" : "") + row.trim();
    });
    push();
    return { lines: lines, parsed: sawMarker && lines.length > 0 };
  }

  function linesFromParsed(project, parsedLines) {
    return parsedLines.map(function (item) {
      var spoken = item.kind === "dialogue" || item.kind === "monologue";
      return newLine({
        type: item.kind,
        speakerId: spoken ? findOrCreateSpeaker(project, item.label, "dialogue") : "",
        text: item.text,
        emotion: item.emotion,
        inVoice: spoken
      });
    });
  }

  function saveDraft(raw, name, folderId) {
    var project = current();
    if (!project) return "";
    var parsed = parseScript(raw);
    var draft = {
      id: uid(),
      name: String(name || "未命名生成稿").slice(0, 40),
      folderId: folderId || "",
      raw: clipText(raw),
      parsed: parsed.parsed,
      lines: parsed.parsed ? linesFromParsed(project, parsed.lines) : [],
      createdAt: Date.now()
    };
    project.drafts.unshift(draft);
    touch();
    return draft.id;
  }

  function replaceUnlocked(target, lines) {
    var locked = target.filter(function (line) { return line.locked; });
    target.length = 0;
    lines.forEach(function (line) { target.push(line); });
    locked.forEach(function (line) { target.push(line); });
  }

  function adoptDraft(id) {
    var project = current();
    if (!project) return false;
    var draft = null;
    project.drafts.forEach(function (item) { if (item.id === id) draft = item; });
    if (!draft || !draft.parsed || !draft.lines.length) return false;
    if (!project.mode) project.mode = activeStructure().kind === "serial" ? "serial" : "short";
    var copies = draft.lines.map(function (line) { return newLine(line); });
    if (project.mode === "serial") {
      var episode = activeEpisode();
      if (!episode) {
        episode = { id: uid(), title: draft.name, summary: "", lines: [] };
        project.episodes.push(episode);
        project.activeEpisodeId = episode.id;
      }
      replaceUnlocked(episode.lines, copies);
    } else {
      replaceUnlocked(project.lines, copies);
    }
    touch();
    return true;
  }

  function saveOutline(items) {
    var project = current();
    if (!project || !Array.isArray(items) || !items.length) return false;
    project.mode = "serial";
    items.forEach(function (item) {
      project.episodes.push({
        id: uid(),
        title: String(item.title || "").slice(0, 40),
        summary: clipText(item.summary),
        lines: []
      });
    });
    project.activeEpisodeId = project.episodes[0].id;
    touch();
    return true;
  }

  function parseOutline(text) {
    var rows = String(text || "").replace(/\r\n?/g, "\n").split("\n");
    var items = [];
    var current = null;
    rows.forEach(function (row) {
      var title = row.trim().match(/^第\s*(\d+)\s*集[:：]\s*(.*)$/);
      if (title) {
        current = { title: title[2].trim() || ("第" + title[1] + "集"), summary: "" };
        items.push(current);
        return;
      }
      if (current && row.trim()) current.summary += (current.summary ? "\n" : "") + row.trim();
    });
    return items;
  }

  function contextLines(lines) {
    return lines.map(function (line, index) {
      var speaker = "";
      if (line.speakerId) {
        var project = current();
        var character = project && project.characters.filter(function (item) { return item.id === line.speakerId; })[0];
        speaker = character ? character.name : "";
      }
      return (index + 1) + ". " + (line.locked ? "锁定 " : "") + typeMeta(line.type).label + (speaker ? " " + speaker : "") + "：" + line.text;
    }).join("\n");
  }

  function generationContext(kind, episode) {
    var project = current();
    if (!project) return null;
    var structure = activeStructure();
    var style = activeStyle();
    var persona = activePersona();
    var mode = project.mode || (structure.kind === "serial" ? "serial" : "short");
    var cast = project.cast.length ? project.cast : db.characters.map(function (item) { return item.id; });
    var people = db.characters.filter(function (item) { return cast.indexOf(item.id) !== -1; });
    var books = [];
    people.forEach(function (person) {
      person.bookIds.forEach(function (bookId) {
        var book = db.books.filter(function (item) { return item.id === bookId; })[0];
        if (book && !books.some(function (item) { return item.id === book.id; })) books.push(book);
      });
    });
    var target = episode || activeEpisode();
    var previous = null;
    var next = null;
    if (mode === "serial" && target) {
      var index = project.episodes.indexOf(target);
      previous = index > 0 ? project.episodes[index - 1] : null;
      next = index >= 0 && index < project.episodes.length - 1 ? project.episodes[index + 1] : null;
    }
    return {
      mode: mode,
      kind: kind,
      core: project.corePrompt,
      story: project.storyPrompt,
      style: style.text,
      structure: structure.text,
      persona: persona ? persona.name + "\n" + persona.body : "",
      characters: people.map(function (person) { return person.name + "\n" + person.body; }).join("\n\n"),
      books: books.map(function (book) { return book.name + "\n" + book.body; }).join("\n\n"),
      locked: contextLines((target && mode === "serial" ? target.lines : project.lines).filter(function (line) { return line.locked; })),
      episode: target ? target.title + "\n" + target.summary : "",
      previous: previous ? contextLines(previous.lines.slice(-8)) : "",
      next: next ? next.title + "\n" + next.summary : "",
      outline: project.episodes.map(function (item, index) {
        return "第" + (index + 1) + "集：" + item.title + "\n" + item.summary;
      }).join("\n")
    };
  }

  function prepareText(text) {
    var value = String(text || "").replace(/\u0000/g, "").replace(/\r\n?/g, "\n").trim();
    if (value.length <= TEXT_LIMIT) return { text: value, truncated: false };
    return { text: value.slice(0, TEXT_LIMIT), truncated: true };
  }

  function decodeXml(value) {
    return String(value || "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, function (_, n) {
      var code = Number(n);
      return code > 0 && code < 1114112 ? String.fromCodePoint(code) : "";
    }).replace(/&#x([0-9a-fA-F]+);/g, function (_, n) {
      var code = parseInt(n, 16);
      return code > 0 && code < 1114112 ? String.fromCodePoint(code) : "";
    }).replace(/&amp;/g, "&");
  }

  function docxXmlToText(xml) {
    return decodeXml(String(xml || "")
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<w:br\/>/g, "\n")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<[^>]+>/g, ""));
  }

  function takesVoice(line, includeMonologue) {
    if (!line || !line.inVoice) return false;
    if (line.type === "monologue" && includeMonologue === false) return false;
    return true;
  }

  function markerName(name) {
    return String(name || "").replace(/[【】\r\n]/g, "").trim();
  }

  function selectedEpisodes(project, ids) {
    if (!project || project.mode !== "serial") return [{ id: "", title: "", lines: project ? project.lines : [] }];
    var wanted = ids && ids.length ? ids : project.episodes.map(function (episode) { return episode.id; });
    return project.episodes.filter(function (episode) { return wanted.indexOf(episode.id) !== -1; });
  }

  function episodeNo(project, episode) {
    var index = project.episodes ? project.episodes.indexOf(episode) : -1;
    return index >= 0 ? index + 1 : 0;
  }

  function tagged(text, enabled, random) {
    return enabled ? applyPlatform(text, activePlatform(), random) : text;
  }

  function voiceText(project, ids, omitted, taggedOn, random) {
    var blocks = [];
    selectedEpisodes(project, ids).forEach(function (episode) {
      var report = analyze({
        characters: project.characters,
        lines: episode.lines,
        includeMonologue: project.includeMonologue
      }, episode.id ? null : omitted);
      if (!report.text) return;
      var no = episodeNo(project, episode);
      blocks.push((no ? "第" + no + "集 " + episode.title + "\n" : "") + tagged(report.text, taggedOn, random));
    });
    return blocks.join("\n\n");
  }

  function fullHtml(project, ids) {
    var sections = selectedEpisodes(project, ids).map(function (episode, index) {
      var rows = episode.lines.map(function (line) {
        var character = null;
        project.characters.forEach(function (item) { if (item.id === line.speakerId) character = item; });
        var label = character ? character.name : typeMeta(line.type).label;
        var color = character ? character.color : "#171717";
        return "<p><strong style=\"color:" + esc(color) + "\">" + esc(label) + "</strong><br>" + esc(line.text || "").replace(/\n/g, "<br>") + (line.emotion ? "<br><small>情绪：" + esc(line.emotion) + "</small>" : "") + "</p>";
      }).join("");
      var no = episodeNo(project, episode);
      var heading = no ? "<h2>第" + no + "集 " + esc(episode.title) + "</h2>" : "";
      return heading + rows;
    }).join("");
    return "<!doctype html><meta charset=\"utf-8\"><title>" + esc(project.name) + "</title><body style=\"font:16px/1.7 sans-serif;max-width:720px;margin:32px auto;padding:0 16px\">" + sections + "</body>";
  }

  function roleTexts(project, ids, taggedOn, random) {
    var files = [];
    project.characters.forEach(function (character) {
      var blocks = [];
      selectedEpisodes(project, ids).forEach(function (episode, index) {
        var rows = episode.lines.filter(function (line) {
          return line.speakerId === character.id && takesVoice(line, project.includeMonologue) && String(line.text || "").trim();
        }).map(function (line) { return String(line.text || "").trim(); });
        if (!rows.length) return;
        var no = episodeNo(project, episode);
        blocks.push((no ? "第" + no + "集 " + episode.title + "\n" : "") + tagged(rows.join("\n"), taggedOn, random));
      });
      if (!blocks.length) return;
      files.push({ name: safeName(character.name || "未命名角色") + ".txt", text: blocks.join("\n\n") });
    });
    return files;
  }

  function analyze(project, omitted) {
    var includeMonologue = !project || project.includeMonologue !== false;
    var skip = omitted || {};
    var characters = (project && project.characters) || [];
    var lines = (project && project.lines) || [];
    var rows = [];
    var excludedByType = { dialogue: 0, monologue: 0, narration: 0, sfx: 0, action: 0 };
    var omittedCount = 0;
    var voiceCount = 0;
    var unnamed = 0;
    var merged = false;
    var skipped = false;
    var prev = null;
    var seenIncluded = false;
    var lastSpeaker = null;

    function nameOf(id) {
      if (!id) return "";
      for (var i = 0; i < characters.length; i++) {
        if (characters[i].id === id) return markerName(characters[i].name);
      }
      return "";
    }

    lines.forEach(function (line) {
      var raw = String(line.text || "").replace(/\r\n?/g, "\n").trim();
      if (!raw) return;
      var type = typeId(line.type);
      if (!takesVoice(line, includeMonologue)) {
        excludedByType[type] += 1;
        skipped = true;
        return;
      }
      if (line.id && skip[line.id]) {
        omittedCount += 1;
        skipped = true;
        return;
      }
      var speakerId = line.speakerId || "";
      var name = nameOf(speakerId);
      if ((type === "dialogue" || type === "monologue") && !name) unnamed += 1;
      if (skipped && seenIncluded && speakerId === lastSpeaker) merged = true;
      var parts = raw.split(/\n+/).map(function (part) { return part.trim(); }).filter(Boolean);
      parts.forEach(function (part, index) {
        var start = index === 0 && prev !== speakerId;
        if (start && name) rows.push("【" + name + "】\n" + part);
        else rows.push(part);
      });
      prev = speakerId;
      lastSpeaker = speakerId;
      seenIncluded = true;
      skipped = false;
      voiceCount += 1;
    });

    return {
      text: rows.join("\n"),
      voiceCount: voiceCount,
      unnamed: unnamed,
      merged: merged,
      omittedCount: omittedCount,
      excludedByType: excludedByType,
      includeMonologue: includeMonologue
    };
  }

  function importProject(obj) {
    var project = obj;
    if (obj && obj.kind === "shenggao-project" && obj.project) project = obj.project;
    if (!project || typeof project !== "object" || !Array.isArray(project.lines)) {
      throw new Error("这不是台本工作室的备份");
    }
    project = JSON.parse(JSON.stringify(project));
    stripSecrets(project);
    project.id = uid();
    normalizeProject(project);
    project.updatedAt = Date.now();
    db.projects.unshift(project);
    db.activeProjectId = project.id;
    persist();
    return { id: project.id, hasKey: !!(obj && obj.settings && obj.settings.apiKey) };
  }

  function applyBackupSettings(obj) {
    if (!obj || !obj.settings) return false;
    var incoming = obj.settings.profiles ? obj.settings : { profiles: [obj.settings], activeProfileId: "" };
    settings = {
      profiles: (incoming.profiles || []).map(freshProfile),
      activeProfileId: ""
    };
    if (!settings.profiles.length) settings = freshSettings();
    settings.activeProfileId = settings.profiles.some(function (item) { return item.id === incoming.activeProfileId; }) ? incoming.activeProfileId : settings.profiles[0].id;
    writeSettings();
    return true;
  }

  function exportProject() {
    var project = current();
    if (!project) return null;
    var copy = JSON.parse(JSON.stringify(project));
    stripSecrets(copy);
    return {
      kind: "shenggao-project",
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: {
        profiles: settings.profiles,
        activeProfileId: settings.activeProfileId
      },
      project: copy
    };
  }

  function snapshot() {
    return JSON.stringify(db);
  }

  function restore(json) {
    var data = JSON.parse(json);
    if (!data || !Array.isArray(data.projects)) throw new Error("无法撤销");
    data.projects.forEach(normalizeProject);
    db = data;
    ensureLibraries();
    persist();
  }

  var db = load();
  if (!db.projects.length) {
    var first = blankProject("");
    db.projects.push(first);
    db.activeProjectId = first.id;
    persist();
  }

  function tipHidden() {
    try { return localStorage.getItem(TIP_KEY) === "1"; } catch (err) { return false; }
  }

  function hideTip() {
    try { localStorage.setItem(TIP_KEY, "1"); } catch (err) {}
  }

  function selfTest() {
    var errors = [];
    function check(cond, msg) { if (!cond) errors.push(msg); }

    var on = analyze(createDemo());
    check(on.text.indexOf("【林夏】\n你还没走。\n我以为末班车会在路口等。") === 0, "demo merge: " + on.text);
    check(on.merged === true, "demo merged flag");
    check(on.text.indexOf("【周屿】\n先喝这个。") !== -1, "demo monologue separates: " + on.text);
    check(on.text.indexOf("风铃又响") === -1, "sfx leaked");
    check(on.text.indexOf("纸杯很烫") === -1, "narration leaked");
    check(on.text.indexOf("推开门") === -1, "action leaked");
    check(on.text.indexOf("放轻") === -1 && on.text.indexOf("平淡") === -1, "emotion leaked");
    check(on.text.indexOf("【林夏】\n明天最早一班是五点。\n你要是也去车站，我们可以一起等。") !== -1, "tail merge: " + on.text);

    var demoOff = createDemo();
    demoOff.includeMonologue = false;
    var off = analyze(demoOff);
    check(off.text.indexOf("【周屿】\n末班二十分钟前就走了。\n先喝这个。") !== -1, "toggle merges 周屿: " + off.text);
    check(off.text.indexOf("这样也好") === -1, "monologue leaked");

    var lin = "c1";
    var chars = [{ id: lin, name: "林夏", color: "#9c3b2e" }];
    var manual = analyze({
      includeMonologue: true,
      characters: chars,
      lines: [
        newLine({ type: "dialogue", speakerId: lin, text: "甲" }),
        newLine({ type: "dialogue", speakerId: lin, text: "去掉", inVoice: false }),
        newLine({ type: "dialogue", speakerId: lin, text: "乙" })
      ]
    });
    check(manual.text === "【林夏】\n甲\n乙" && manual.merged === true, "manual: " + manual.text);

    var forced = analyze({
      includeMonologue: true,
      characters: chars,
      lines: [newLine({ type: "narration", text: "念出来", inVoice: true })]
    });
    check(forced.text === "念出来", "forced: " + forced.text);

    var locked = analyze({
      includeMonologue: true,
      characters: chars,
      lines: [newLine({ type: "dialogue", speakerId: lin, text: "锁着也要念", locked: true })]
    });
    check(locked.text === "【林夏】\n锁着也要念", "locked: " + locked.text);

    var multi = analyze({
      includeMonologue: true,
      characters: chars,
      lines: [newLine({ type: "dialogue", speakerId: lin, text: "第一句\n第二句" })]
    });
    check(multi.text === "【林夏】\n第一句\n第二句", "multi: " + multi.text);

    var noname = analyze({
      includeMonologue: true,
      characters: chars,
      lines: [newLine({ type: "dialogue", text: "没名字" })]
    });
    check(noname.text === "没名字" && noname.unnamed === 1, "noname");

    var monoLine = newLine({ type: "monologue", speakerId: lin, text: "心里" });
    var mono = analyze({
      includeMonologue: false,
      characters: chars,
      lines: [monoLine]
    });
    check(mono.text === "", "mono off");
    var spoken = newLine({ id: "spoken", type: "dialogue", speakerId: lin, text: "你还没走。" });
    var later = newLine({ id: "later", type: "dialogue", speakerId: lin, text: "我还在。" });
    var sample = { characters: chars, lines: [spoken, newLine({ type: "narration", text: "车停了。", inVoice: false }), later], includeMonologue: true };
    var omit = {};
    omit[spoken.id] = true;
    var hidden = analyze(sample, omit);
    check(hidden.omittedCount === 1 && hidden.text === "【林夏】\n我还在。" && hidden.voiceCount === 1, "temporary omit: " + hidden.text);
    check(spoken.inVoice === true, "omit does not edit line");
    var platformId = savePlatform("测试平台", platformTemplate(), "");
    var marked = applyPlatform("妈妈，（轻笑）我饿了。（她看了看碗）", activePlatform(), function () { return 0; });
    check(marked === "妈妈，(chuckle)我饿了。", "platform mark: " + marked);
    var pause = applyPlatform("(停一下)", activePlatform(), function () { return 1; });
    check(pause === "<#0.60#>", "pause range: " + pause);
    var taggedVoice = voiceText({ characters: chars, lines: [newLine({ type: "dialogue", speakerId: lin, text: "(轻笑)来。" })], includeMonologue: true, episodes: [] }, [], {}, true);
    check(taggedVoice.indexOf("(chuckle)") !== -1, "voice tag: " + taggedVoice);
    deletePlatform(platformId);

    var saved = snapshot();
    try {
      var project = blankProject("资料测试");
      addProject(project);
      var card = importMaterial("character", "角色正文");
      var bookA = importMaterial("book", "世界甲");
      var bookB = importMaterial("book", "世界乙");
      setCharacterNameChecked(card, "林夏");
      setBookName(bookA, "末班车站");
      setBookName(bookB, "便利店");
      var duplicated = false;
      try { setBookName(bookB, "末班车站"); } catch (err) { duplicated = err && err.code === "duplicate-name"; }
      check(duplicated, "duplicate book name");
      toggleBookLink(card, bookA);
      toggleBookLink(card, bookB);
      toggleBookLink(card, bookA);
      toggleCast(card);
      var now = current();
      var madeCard = now.characters.filter(function (item) { return item.id === card; })[0];
      check(!!madeCard && madeCard.name === "林夏" && madeCard.body === "角色正文", "card body");
      check(!!madeCard && madeCard.bookIds.length === 1 && madeCard.bookIds[0] === bookB, "link many: " + (madeCard ? madeCard.bookIds.join(",") : ""));
      check(now.cast.length === 1 && now.cast[0] === card, "cast");
      deleteBook(bookB);
      var cleared = current().characters.filter(function (item) { return item.id === card; })[0];
      check(!!cleared && cleared.bookIds.length === 0, "link cleared");

      var persona = importPersona("听众设定");
      setPersonaName(persona, "听众");
      var personaDup = false;
      var other = addPersona();
      try { setPersonaName(other, "听众"); } catch (err2) { personaDup = err2 && err2.code === "duplicate-name"; }
      check(personaDup, "duplicate persona");
      usePersona(persona);
      check(activePersona() && activePersona().body === "听众设定", "active persona");

      check(db.styles.some(function (item) { return item.id === BUILTIN_STYLE_ID && item.builtin; }), "builtin style");
      check(deleteStyle(BUILTIN_STYLE_ID) === false, "style locked");
      var styleCopy = duplicateStyle(BUILTIN_STYLE_ID);
      setStyleName(styleCopy, "我的文风");
      setStyleText(styleCopy, "自定义");
      check(db.styles.some(function (item) { return item.id === BUILTIN_STYLE_ID && item.text.indexOf("第一视角") !== -1; }), "builtin style intact");
      check(deleteStyle(styleCopy) === true, "style copy deleted");

      check(db.structures.filter(function (item) { return item.builtin; }).length === 2, "two structures");
      var structureCopy = duplicateStructure(BUILTIN_SHORT_ID);
      setStructureText(BUILTIN_SHORT_ID, "不许改");
      check(db.structures.some(function (item) { return item.id === BUILTIN_SHORT_ID && item.text.indexOf("不许改") === -1; }), "structure locked");
      setStructureName(structureCopy, "我的短篇");
      check(deleteStructure(structureCopy) === true && deleteStructure(BUILTIN_SERIAL_ID) === false, "structure delete");

      var prepared = prepareText("甲".repeat(TEXT_LIMIT + 5));
      check(prepared.truncated === true && prepared.text.length === TEXT_LIMIT, "truncate");
      check(docxXmlToText("<w:p><w:r><w:t>林夏</w:t></w:r></w:p><w:p><w:t>你好</w:t></w:p>") === "林夏\n你好\n", "docx text");

      var parsed = parseScript("【林夏】\n你还没走。\n情绪：放轻\n我以为末班车会在路口等。\n\n【旁白】\n夜班公交已经停了。");
      check(parsed.parsed && parsed.lines.length === 2, "parse count");
      check(parsed.lines[0].kind === "dialogue" && parsed.lines[0].emotion === "放轻" && parsed.lines[0].text.indexOf("情绪") === -1, "parse dialogue");
      check(parsed.lines[1].kind === "narration" && parsed.lines[1].text === "夜班公交已经停了。", "parse narration");
      var broken = parseScript("这里没有标记");
      check(broken.parsed === false, "parse keeps raw");
      var outline = parseOutline("第 1 集：末班\n他没上车。\n第2集：灯\n灯还亮着。");
      check(outline.length === 2 && outline[0].title === "末班" && outline[1].summary === "灯还亮着。", "outline");
      var draftId = saveDraft("【林夏】\n等我一下。", "第一稿", "");
      var made = current().drafts.filter(function (item) { return item.id === draftId; })[0];
      check(made && made.parsed && made.lines[0].speakerId, "draft speaker");
      var locked = newLine({ text: "锁定这句", locked: true });
      current().lines = [locked];
      check(adoptDraft(draftId) === true, "adopt");
      check(current().lines.length === 2 && current().lines.some(function (line) { return line.locked && line.text === "锁定这句"; }), "locked kept");
      check(current().mode === "short", "mode fixed");
      var folder = addFolder();
      setFolderName(folder, "可用");
      moveDraft(draftId, folder);
      deleteFolder(folder);
      check(current().drafts[0].folderId === "", "folder delete keeps draft");
    } finally {
      restore(saved);
    }
    return errors;
  }

  var testErrors = [];
  try {
    testErrors = selfTest();
  } catch (err) {
    testErrors = ["自测中断：" + (err && err.message ? err.message : "未知错误")];
  }
  if (testErrors.length && typeof console !== "undefined") console.error(testErrors);

  var api = {
    TYPES: TYPES,
    PALETTE: PALETTE,
    STEPS: STEPS,
    ui: { tab: "director", sheet: null, openId: "", voiceOmit: {} },
    testErrors: testErrors,
    esc: esc,
    safeColor: safeColor,
    safeName: safeName,
    typeMeta: typeMeta,
    formatTime: formatTime,
    current: current,
    projects: listProjects,
    snapshot: snapshot,
    restore: restore,
    save: persist,
    saveError: function () { return saveError; },
    blankProject: blankProject,
    createDemo: createDemo,
    addProject: addProject,
    deleteProject: deleteProject,
    openProject: openProject,
    rename: rename,
    setIncludeMonologue: setIncludeMonologue,
    analyze: analyze,
    voiceText: voiceText,
    fullHtml: fullHtml,
    roleTexts: roleTexts,
    platforms: function () { return db.platforms; },
    activePlatform: activePlatform,
    platformTemplate: platformTemplate,
    parsePlatform: parsePlatform,
    savePlatform: savePlatform,
    deletePlatform: deletePlatform,
    duplicatePlatform: duplicatePlatform,
    setPlatformName: setPlatformName,
    setPlatformText: setPlatformText,
    usePlatform: usePlatform,
    addLine: function () { return insertAfter(""); },
    insertAfter: insertAfter,
    deleteLine: deleteLine,
    moveLine: moveLine,
    toggleVoice: toggleVoice,
    toggleLock: toggleLock,
    setText: setText,
    setEmotion: setEmotion,
    setLineType: setLineType,
    setSpeaker: setSpeaker,
    addCharacter: addCharacter,
    deleteCharacter: deleteCharacter,
    setCharacterName: setCharacterName,
    setCharacterNameChecked: setCharacterNameChecked,
    setCharacterColor: setCharacterColor,
    setCharacterBody: setCharacterBody,
    addBook: addBook,
    deleteBook: deleteBook,
    setBookName: setBookName,
    setBookBody: setBookBody,
    toggleBookLink: toggleBookLink,
    toggleCast: toggleCast,
    importMaterial: importMaterial,
    personas: function () { return db.personas; },
    activePersona: activePersona,
    addPersona: addPersona,
    deletePersona: deletePersona,
    setPersonaName: setPersonaName,
    setPersonaBody: setPersonaBody,
    usePersona: usePersona,
    importPersona: importPersona,
    styles: function () { return db.styles; },
    structures: function () { return db.structures; },
    activeStyleId: function () { return db.activeStyleId; },
    activeStructureId: function () { return db.activeStructureId; },
    addStyle: addStyle,
    duplicateStyle: duplicateStyle,
    deleteStyle: deleteStyle,
    setStyleName: setStyleName,
    setStyleText: setStyleText,
    useStyle: useStyle,
    addStructure: addStructure,
    duplicateStructure: duplicateStructure,
    deleteStructure: deleteStructure,
    setStructureName: setStructureName,
    setStructureKind: setStructureKind,
    setStructureText: setStructureText,
    useStructure: useStructure,
    activeStructure: activeStructure,
    activeStyle: activeStyle,
    activeEpisode: activeEpisode,
    workingLines: workingLines,
    setCorePrompt: setCorePrompt,
    setStoryPrompt: setStoryPrompt,
    setEpisodeTitle: setEpisodeTitle,
    setEpisodeSummary: setEpisodeSummary,
    openEpisode: openEpisode,
    addFolder: addFolder,
    setFolderName: setFolderName,
    deleteFolder: deleteFolder,
    moveDraft: moveDraft,
    setDraftName: setDraftName,
    setDraftText: setDraftText,
    deleteDraftLine: deleteDraftLine,
    deleteDraft: deleteDraft,
    parseScript: parseScript,
    parseOutline: parseOutline,
    saveDraft: saveDraft,
    adoptDraft: adoptDraft,
    saveOutline: saveOutline,
    generationContext: generationContext,
    settings: function () {
      var profile = activeProfile();
      return { id: profile.id, name: profile.name, baseUrl: profile.baseUrl, model: profile.model, models: profile.models, hasKey: !!profile.apiKey, apiKey: profile.apiKey };
    },
    profiles: function () { return settings.profiles; },
    saveSettings: saveSettings,
    addProfile: addProfile,
    useProfile: useProfile,
    setProfileName: setProfileName,
    deleteProfile: deleteProfile,
    applyBackupSettings: applyBackupSettings,
    prepareText: prepareText,
    docxXmlToText: docxXmlToText,
    TEXT_LIMIT: TEXT_LIMIT,
    importProject: importProject,
    exportProject: exportProject,
    tipHidden: tipHidden,
    hideTip: hideTip,
    selfTest: selfTest
  };

  var root = typeof globalThis !== "undefined" ? globalThis : this;
  root.SG = api;

  if (typeof window === "undefined") {
    if (testErrors.length) {
      console.error(testErrors.join("\n"));
      if (root.process && root.process.exit) root.process.exit(1);
    } else {
      console.log("selfTest ok");
    }
  }
})();
