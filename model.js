/* 声稿 · 数据和配音稿规则
   顺序见 SPEC.md。未明确要求不要推送或部署。
   步骤：1 逐行编辑 2 资料和预设 3 生成 4 配音稿核对 5 导出 6 平台标签
*/
(function () {
  "use strict";

  var KEY = "shenggao.v1";
  var TIP_KEY = "shenggao.tip1";

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
    { n: 2, state: "next", title: "资料和预设", text: "导入 txt、docx 的角色和世界书。角色可绑定世界书，出场角色可多选。内置短篇小剧场、长篇分集两套只读提示词，复制后才能改，也可以自己另存。结构约束和文风分开。" },
    { n: 3, state: "todo", title: "生成", text: "连接 OpenAI 兼容接口，密钥只留在这台设备。短篇一次生成。长篇先给各集标题和简介，确认后再逐集写。单集可重写，默认情节连贯，带上一集结尾和下一集开头。锁定的行不覆盖。" },
    { n: 4, state: "todo", title: "配音稿核对", text: "导出前再核对一次。旁白、音效、动作和情绪默认去掉。内心独白默认保留，可以关。可以临时把某一行勾进或剔出。" },
    { n: 5, state: "todo", title: "导出", text: "完整本给人看，可以带颜色。纯人声文本、按角色拆开的文本、项目文件。改完当前稿再导出。" },
    { n: 6, state: "todo", title: "平台标签", text: "不同语音平台的标签做成导出预设，不写进原稿。没有对照官方文档核实过的，先导出纯文本。" }
  ];

  var db = load();
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
    return { version: 1, activeProjectId: null, projects: [] };
  }

  function stripSecrets(project) {
    if (!project || typeof project !== "object") return;
    delete project.api;
    delete project.apiKey;
    delete project.key;
  }

  function normalizeProject(project) {
    if (!project.id) project.id = uid();
    project.name = String(project.name || "未命名广播剧");
    if (!project.createdAt) project.createdAt = Date.now();
    if (!project.updatedAt) project.updatedAt = project.createdAt;
    if (typeof project.includeMonologue !== "boolean") project.includeMonologue = true;
    if (!Array.isArray(project.characters)) project.characters = [];
    if (!Array.isArray(project.lines)) project.lines = [];
    project.characters.forEach(function (character) {
      if (!character.id) character.id = uid();
      character.name = String(character.name || "");
      character.color = safeColor(character.color);
    });
    var ids = {};
    project.characters.forEach(function (character) { ids[character.id] = true; });
    project.lines.forEach(function (line) {
      if (!line.id) line.id = uid();
      line.type = typeId(line.type);
      line.speakerId = line.speakerId && ids[line.speakerId] ? line.speakerId : "";
      line.text = String(line.text || "");
      line.emotion = String(line.emotion || "");
      line.inVoice = !!line.inVoice;
      line.locked = !!line.locked;
    });
    return project;
  }

  function load() {
    var data = fresh();
    var raw = null;
    try {
      if (typeof localStorage === "undefined" || !localStorage.getItem) return data;
      raw = localStorage.getItem(KEY);
    } catch (err) {
      return data;
    }
    if (!raw) return data;
    try {
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.projects)) return data;
      parsed.version = parsed.version || 1;
      parsed.projects.forEach(normalizeProject);
      if (!parsed.projects.some(function (project) { return project.id === parsed.activeProjectId; })) {
        parsed.activeProjectId = parsed.projects[0] ? parsed.projects[0].id : null;
      }
      return parsed;
    } catch (err) {
      try { localStorage.setItem(KEY + ".corrupt", raw); } catch (ignore) {}
      return data;
    }
  }

  function current() {
    for (var i = 0; i < db.projects.length; i++) {
      if (db.projects[i].id === db.activeProjectId) return db.projects[i];
    }
    return null;
  }

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
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
      id: uid(),
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

  function findLine(id) {
    var project = current();
    if (!project) return null;
    for (var i = 0; i < project.lines.length; i++) {
      if (project.lines[i].id === id) return project.lines[i];
    }
    return null;
  }

  function speakerNear(project, index) {
    for (var i = index; i >= 0; i--) {
      var line = project.lines[i];
      if ((line.type === "dialogue" || line.type === "monologue") && line.speakerId) return line.speakerId;
    }
    return project.characters[0] ? project.characters[0].id : "";
  }

  function insertAfter(id) {
    var project = current();
    if (!project) return "";
    var index = project.lines.length - 1;
    if (id) {
      var found = -1;
      for (var i = 0; i < project.lines.length; i++) {
        if (project.lines[i].id === id) found = i;
      }
      if (found >= 0) index = found;
    }
    var line = newLine({ type: "dialogue", speakerId: speakerNear(project, index) });
    if (!id) project.lines.push(line);
    else project.lines.splice(index + 1, 0, line);
    touch();
    return line.id;
  }

  function deleteLine(id) {
    var project = current();
    if (!project) return;
    project.lines = project.lines.filter(function (line) { return line.id !== id; });
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
    if (moveItem(project.lines, id, dir)) touch();
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
    var ok = speakerId && project.characters.some(function (character) { return character.id === speakerId; });
    line.speakerId = ok ? speakerId : "";
    touch();
  }

  function addCharacter() {
    var project = current();
    if (!project) return "";
    var character = {
      id: uid(),
      name: "",
      color: PALETTE[project.characters.length % PALETTE.length]
    };
    project.characters.push(character);
    touch();
    return character.id;
  }

  function deleteCharacter(id) {
    var project = current();
    if (!project) return;
    project.characters = project.characters.filter(function (character) { return character.id !== id; });
    project.lines.forEach(function (line) {
      if (line.speakerId === id) line.speakerId = "";
    });
    touch();
  }

  function setCharacterName(id, name) {
    var project = current();
    if (!project) return;
    for (var i = 0; i < project.characters.length; i++) {
      if (project.characters[i].id === id) {
        project.characters[i].name = String(name || "").slice(0, 32);
        touch();
        return;
      }
    }
  }

  function setCharacterColor(id, color) {
    var project = current();
    if (!project) return;
    if (!/^#[0-9a-fA-F]{6}$/.test(color || "")) return;
    for (var i = 0; i < project.characters.length; i++) {
      if (project.characters[i].id === id) {
        project.characters[i].color = color;
        touch();
        return;
      }
    }
  }

  function takesVoice(line, includeMonologue) {
    if (!line || !line.inVoice) return false;
    if (line.type === "monologue" && includeMonologue === false) return false;
    return true;
  }

  function markerName(name) {
    return String(name || "").replace(/[【】\r\n]/g, "").trim();
  }

  function analyze(project) {
    var includeMonologue = !project || project.includeMonologue !== false;
    var characters = (project && project.characters) || [];
    var lines = (project && project.lines) || [];
    var rows = [];
    var excludedByType = { dialogue: 0, monologue: 0, narration: 0, sfx: 0, action: 0 };
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
      excludedByType: excludedByType,
      includeMonologue: includeMonologue
    };
  }

  function importProject(obj) {
    var project = obj;
    if (obj && obj.kind === "shenggao-project" && obj.project) project = obj.project;
    if (!project || typeof project !== "object" || !Array.isArray(project.lines) || !Array.isArray(project.characters)) {
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
    return project.id;
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

    var mono = analyze({
      includeMonologue: false,
      characters: chars,
      lines: [newLine({ type: "monologue", speakerId: lin, text: "心里" })]
    });
    check(mono.text === "", "mono off");
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
    ui: { tab: "director", sheet: null },
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
    setCharacterColor: setCharacterColor,
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
