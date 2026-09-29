(function () {
  "use strict";
  var SG = window.SG;

  function typeOptions(selected) {
    return SG.TYPES.map(function (type) {
      return '<option value="' + type.id + '"' + (type.id === selected ? " selected" : "") + ">" + SG.esc(type.label) + "</option>";
    }).join("");
  }

  function speakerOptions(project, line) {
    var html = '<option value="">未指定</option>';
    project.characters.forEach(function (character) {
      var label = character.name || "未命名";
      html += '<option value="' + SG.esc(character.id) + '"' + (character.id === line.speakerId ? " selected" : "") + ">" + SG.esc(label) + "</option>";
    });
    return html;
  }

  function characterOf(project, id) {
    for (var i = 0; i < project.characters.length; i++) {
      if (project.characters[i].id === id) return project.characters[i];
    }
    return null;
  }

  function lineCard(project, line, index, total) {
    var meta = SG.typeMeta(line.type);
    var spoken = line.type === "dialogue" || line.type === "monologue";
    var voiceOn = !!line.inVoice && !(line.type === "monologue" && project.includeMonologue === false);
    var voiceLabel = voiceOn ? "要念" : "不念";
    var lockLabel = line.locked ? "已锁定" : "锁定";
    var placeholder = spoken && !line.speakerId ? "先指定说话人，再写台词" : meta.placeholder;
    return '' +
      '<article class="line" data-line="' + SG.esc(line.id) + '">' +
        '<div class="line-tools">' +
          '<span class="line-no">' + (index + 1) + "</span>" +
          '<button type="button" data-action="move-line" data-id="' + SG.esc(line.id) + '" data-dir="-1"' + (index === 0 ? " disabled" : "") + ' aria-label="上移">上移</button>' +
          '<button type="button" data-action="move-line" data-id="' + SG.esc(line.id) + '" data-dir="1"' + (index === total - 1 ? " disabled" : "") + ' aria-label="下移">下移</button>' +
          '<button type="button" data-action="delete-line" data-id="' + SG.esc(line.id) + '">删除</button>' +
        "</div>" +
        '<div class="line-meta">' +
          '<label class="type">类型<select data-action="line-type" data-id="' + SG.esc(line.id) + '">' + typeOptions(line.type) + "</select></label>" +
          (spoken ? '<label class="speaker">说话人<select data-action="line-speaker" data-id="' + SG.esc(line.id) + '">' + speakerOptions(project, line) + "</select></label>" : "") +
          '<button type="button" class="pill' + (voiceOn ? " on" : "") + '" data-action="toggle-voice" data-id="' + SG.esc(line.id) + '">' + voiceLabel + "</button>" +
          '<button type="button" class="pill' + (line.locked ? " on" : "") + '" data-action="toggle-lock" data-id="' + SG.esc(line.id) + '">' + lockLabel + "</button>" +
        "</div>" +
        '<label class="text-label">正文<textarea data-action="line-text" data-id="' + SG.esc(line.id) + '" rows="2" placeholder="' + SG.esc(placeholder) + '">' + SG.esc(line.text) + "</textarea></label>" +
        '<label class="emotion-label">情绪<span>只留在导演本</span><input data-action="line-emotion" data-id="' + SG.esc(line.id) + '" value="' + SG.esc(line.emotion) + '" maxlength="24" placeholder="例如：压低声音"></label>' +
        '<button type="button" class="insert" data-action="insert-line" data-id="' + SG.esc(line.id) + '">在下面加一行</button>' +
      "</article>";
  }

  function director(project) {
    var lines = SG.workingLines(project);
    if (project.mode === "serial" && !project.episodes.length) {
      return '<div class="empty"><p>长篇还没有分集。先到生成里确认各集标题和简介。</p></div>';
    }
    if (!lines.length) {
      return '<div class="empty"><p>还没有台词。</p><button type="button" class="primary" data-action="add-line">写第一行</button></div>';
    }
    return lines.map(function (line, index) {
      return lineCard(project, line, index, lines.length);
    }).join("") + '<button type="button" class="add-end" data-action="add-line">加一行</button>';
  }

  function voice(project) {
    var lines = SG.workingLines(project);
    var omitted = SG.ui.voiceOmit || {};
    var result = SG.analyze({ characters: project.characters, lines: lines, includeMonologue: project.includeMonologue }, omitted);
    var counts = result.excludedByType;
    var excluded = counts.narration + counts.sfx + counts.action + counts.dialogue + counts.monologue;
    var note = result.includeMonologue ? "内心独白算人声" : "内心独白这次不念";
    var warning = result.unnamed ? '<p class="warn">' + result.unnamed + " 行对白或独白还没有角色名，配音稿里暂时不加【】。</p>" : "";
    var body = result.text
      ? '<pre class="script">' + SG.esc(result.text) + "</pre>"
      : '<div class="empty"><p>配音稿还是空的。把对白标成「要念」，或者打开内心独白。</p></div>';
    var checks = lines.filter(function (line) { return line.inVoice && String(line.text || "").trim(); }).map(function (line) {
      var speaker = project.characters.filter(function (item) { return item.id === line.speakerId; })[0];
      var label = speaker ? speaker.name : SG.typeMeta(line.type).label;
      var on = !omitted[line.id];
      return '<label class="check"><input type="checkbox" data-action="omit-voice" data-id="' + SG.esc(line.id) + '"' + (on ? " checked" : "") + "><span>" + SG.esc(label) + " · " + SG.esc(String(line.text || "").slice(0, 24)) + "</span></label>";
    }).join("");
    return '' +
      '<div class="voice-bar">' +
        "<div><strong>" + result.voiceCount + " 行人声</strong><span>规则去掉 " + excluded + " 行" + (result.omittedCount ? "，这次勾掉 " + result.omittedCount + " 行" : "") + (result.unnamed ? "，" + result.unnamed + " 行没写角色名" : "") + "</span></div>" +
        '<label class="switch"><input type="checkbox" data-action="monologue"' + (project.includeMonologue !== false ? " checked" : "") + "><span>" + note + "</span></label>" +
        '<button type="button" class="primary" data-action="copy-voice"' + (result.text ? "" : " disabled") + ">复制配音稿</button>" +
      "</div>" +
      warning +
      '<p class="hint">勾选只影响这次预览和复制，不改导演本。刷新后恢复。同一角色连续说，只在这一轮开头标一次名字。</p>' +
      (project.mode === "serial" ? '<p class="hint tight">现在只核对当前这一集。</p>' : "") +
      exportBox(project) +
      (checks ? '<div class="checks voice-checks">' + checks + "</div>" : "") +
      body;
  }

  function exportBox(project) {
    var choices = SG.ui.exportChoices || { html: true, voice: true, roles: true, tags: false };
    var platform = SG.activePlatform();
    var tracks = project.mode === "serial" ? project.episodes.map(function (episode, index) {
      var selected = !SG.ui.exportEpisodes || SG.ui.exportEpisodes[episode.id] !== false;
      return '<label class="check"><input type="checkbox" data-action="export-episode" data-id="' + SG.esc(episode.id) + '"' + (selected ? " checked" : "") + "><span>第" + (index + 1) + "集 " + SG.esc(episode.title || "未命名") + "</span></label>";
    }).join("") : "";
    var any = choices.html || choices.voice || choices.roles;
    return '<section class="block"><h2>导出</h2>' +
      '<div class="checks">' +
        '<label class="check"><input type="checkbox" data-action="export-choice" data-kind="html"' + (choices.html ? " checked" : "") + "><span>完整本 HTML</span></label>" +
        '<label class="check"><input type="checkbox" data-action="export-choice" data-kind="voice"' + (choices.voice ? " checked" : "") + "><span>纯人声 TXT</span></label>" +
        '<label class="check"><input type="checkbox" data-action="export-choice" data-kind="roles"' + (choices.roles ? " checked" : "") + "><span>按角色拆开 ZIP</span></label>" +
        '<label class="check"><input type="checkbox" data-action="export-choice" data-kind="tags"' + (choices.tags ? " checked" : "") + "><span>平台标签</span></label>" +
        '<button type="button" class="icon" data-action="platform-help" aria-label="平台标签教程">?</button>' +
      "</div>" +
      '<p class="hint tight">当前标签预设：' + SG.esc(platform ? platform.name || "未命名" : "还没有") + '。只替换纯人声和按角色拆开的文本。</p>' +
      (tracks ? '<p class="hint tight">勾选要放进同一个文件的音轨。</p><div class="checks">' + tracks + "</div>" : "") +
      '<button type="button" class="primary" data-action="export-files"' + (any ? "" : " disabled") + ">下载勾选的文件</button>" +
      '<div class="line-tools"><button type="button" data-action="copy-platform-template">复制模板</button><label class="file">导入标签预设<input type="file" accept=".txt,text/plain" data-action="upload-platform"></label></div>' +
      '<p class="hint tight">项目备份仍用右上角。这里不导出 JSON。</p></section>';
  }

  function bookChecks(project, character) {
    if (!project.books.length) return '<p class="hint tight">还没有世界书。可以先导入一份，再绑到这个角色。</p>';
    return '<div class="checks">' + project.books.map(function (book) {
      var on = character.bookIds.indexOf(book.id) !== -1;
      return '<label class="check"><input type="checkbox" data-action="link-book" data-id="' + SG.esc(character.id) + '" data-book="' + SG.esc(book.id) + '"' + (on ? " checked" : "") + '><span>' + SG.esc(book.name || "未命名世界书") + "</span></label>";
    }).join("") + "</div>";
  }

  function people(project) {
    var cast = project.characters.map(function (character) {
      var on = project.cast.indexOf(character.id) !== -1;
      return '<label class="check"><input type="checkbox" data-action="cast" data-id="' + SG.esc(character.id) + '"' + (on ? " checked" : "") + '><span>' + SG.esc(character.name || "未命名角色") + "</span></label>";
    }).join("");
    var castBox = project.characters.length
      ? '<section class="block"><h2>出场角色</h2><p class="hint tight">可多选。这一步只记下谁出场，还不生成。</p><div class="checks">' + cast + "</div></section>"
      : "";
    var cards = project.characters.map(function (character) {
      return '' +
        '<article class="card">' +
          '<div class="card-head"><input class="name" data-action="character-name" data-id="' + SG.esc(character.id) + '" value="' + SG.esc(character.name) + '" maxlength="32" placeholder="角色名，自己填写"><button type="button" data-action="delete-character" data-id="' + SG.esc(character.id) + '">删除</button></div>' +
          '<details' + (SG.ui.openId === character.id ? " open" : "") + '><summary>正文</summary><label class="text-label">角色卡<textarea data-action="character-body" data-id="' + SG.esc(character.id) + '" rows="4" placeholder="可自己写，也可导入 txt 或 docx">' + SG.esc(character.body || "") + "</textarea></label></details>" +
          "<p class=\"hint tight\">绑定世界书，可多选。</p>" +
          bookChecks(project, character) +
        "</article>";
    }).join("");
    if (!cards) cards = '<div class="empty"><p>还没有角色卡。配音稿里仍用角色名区分说话人。</p></div>';
    return castBox +
      cards +
      '<div class="sheet-actions">' +
        '<button type="button" class="add-end" data-action="add-character">加角色卡</button>' +
        '<label class="file">导入角色卡<input type="file" accept=".txt,.docx,text/plain" data-action="upload-material" data-kind="character"></label>' +
      "</div>";
  }

  function books(project) {
    var cards = project.books.map(function (book) {
      var users = project.characters.filter(function (character) {
        return character.bookIds.indexOf(book.id) !== -1;
      }).map(function (character) { return character.name || "未命名角色"; });
      var used = users.length ? "已绑：" + users.join("、") : "还没有角色绑定这份。";
      return '' +
        '<article class="card">' +
          '<div class="card-head"><input class="name" data-action="book-name" data-id="' + SG.esc(book.id) + '" value="' + SG.esc(book.name) + '" maxlength="32" placeholder="世界书名，自己填写"><button type="button" data-action="delete-book" data-id="' + SG.esc(book.id) + '">删除</button></div>' +
          '<details' + (SG.ui.openId === book.id ? " open" : "") + '><summary>正文</summary><label class="text-label">正文<textarea data-action="book-body" data-id="' + SG.esc(book.id) + '" rows="5" placeholder="可自己写，也可导入 txt 或 docx">' + SG.esc(book.body || "") + "</textarea></label></details>" +
          '<p class="hint tight">' + SG.esc(used) + "</p>" +
        "</article>";
    }).join("");
    if (!cards) cards = '<div class="empty"><p>还没有世界书。一份世界书可以绑给多个角色。</p></div>';
    return cards +
      '<div class="sheet-actions">' +
        '<button type="button" class="add-end" data-action="add-book">加世界书</button>' +
        '<label class="file">导入世界书<input type="file" accept=".txt,.docx,text/plain" data-action="upload-material" data-kind="book"></label>' +
      "</div>";
  }

  function personas() {
    var active = SG.activePersona();
    var list = SG.personas();
    var cards = list.map(function (persona) {
      var on = active && persona.id === active.id;
      return '' +
        '<article class="card' + (on ? " picked" : "") + '">' +
          '<div class="card-head"><input class="name" data-action="persona-name" data-id="' + SG.esc(persona.id) + '" value="' + SG.esc(persona.name) + '" maxlength="32" placeholder="人设名，自己填写"><button type="button" data-action="delete-persona" data-id="' + SG.esc(persona.id) + '">删除</button></div>' +
          '<details' + (SG.ui.openId === persona.id ? " open" : "") + '><summary>正文</summary><label class="text-label">用户人设<textarea data-action="persona-body" data-id="' + SG.esc(persona.id) + '" rows="5" placeholder="听众视角。一般不说台词。">' + SG.esc(persona.body || "") + "</textarea></label></details>" +
          (on ? '<p class="hint tight">当前使用。换项目也仍然用这一份。</p>' : '<button type="button" data-action="use-persona" data-id="' + SG.esc(persona.id) + '">改用这一份</button>') +
        "</article>";
    }).join("");
    if (!cards) cards = '<div class="empty"><p>还没有用户人设。它是听众视角，和角色卡分开，全项目共用。</p></div>';
    return '<p class="hint">用户人设不跟某一个项目走。可以存多份，同时只用一份。</p>' +
      cards +
      '<div class="sheet-actions">' +
        '<button type="button" class="add-end" data-action="add-persona">加人设</button>' +
        '<label class="file">导人人设<input type="file" accept=".txt,.docx,text/plain" data-action="upload-persona"></label>' +
      "</div>";
  }

  function presetList(items, activeId, kind) {
    return items.map(function (item) {
      var on = item.id === activeId;
      var locked = !!item.builtin;
      return '' +
        '<article class="card' + (on ? " picked" : "") + '">' +
          '<div class="card-head">' +
            (locked
              ? '<strong class="name locked">' + SG.esc(item.name) + "</strong>"
              : '<input class="name" data-action="' + kind + '-name" data-id="' + SG.esc(item.id) + '" value="' + SG.esc(item.name) + '" maxlength="32" placeholder="名称，自己填写">') +
            (locked ? "" : '<button type="button" data-action="delete-' + kind + '" data-id="' + SG.esc(item.id) + '">删除</button>') +
          "</div>" +
          (locked ? '<p class="hint tight">内置，不能改，也不能删。要改就复制一份。</p>' : "") +
          (kind === "structure" && !locked ? '<label class="check">类型<select data-action="structure-kind" data-id="' + SG.esc(item.id) + '"><option value="short"' + (item.kind === "serial" ? "" : " selected") + '>短篇，一次写完</option><option value="serial"' + (item.kind === "serial" ? " selected" : "") + '>长篇，先分集</option></select></label>' : "") +
          '<details' + (SG.ui.openId === item.id ? " open" : "") + '><summary>正文</summary><label class="text-label">正文<textarea data-action="' + kind + '-text" data-id="' + SG.esc(item.id) + '" rows="6"' + (locked ? " readonly" : "") + '>' + SG.esc(item.text || "") + "</textarea></label></details>" +
          '<div class="line-tools">' +
            (on ? '<span class="hint tight">当前使用</span>' : '<button type="button" data-action="use-' + kind + '" data-id="' + SG.esc(item.id) + '">改用这一套</button>') +
            '<button type="button" data-action="copy-' + kind + '" data-id="' + SG.esc(item.id) + '">复制副本</button>' +
          "</div>" +
        "</article>";
    }).join("");
  }

  function episodeBar(project) {
    if (project.mode !== "serial" || !project.episodes.length) return "";
    var current = SG.activeEpisode();
    return '<div class="episode-bar">' + project.episodes.map(function (episode, index) {
      var on = current && episode.id === current.id;
      return '<button type="button"' + (on ? ' class="on"' : "") + ' data-action="open-episode" data-id="' + SG.esc(episode.id) + '">第' + (index + 1) + "集</button>";
    }).join("") + "</div>";
  }

  function draftCard(project, draft) {
    var options = '<option value="">未分类</option>' + project.folders.map(function (folder) {
      return '<option value="' + SG.esc(folder.id) + '"' + (draft.folderId === folder.id ? " selected" : "") + '>' + SG.esc(folder.name || "未命名文件夹") + "</option>";
    }).join("");
    var body = draft.parsed
      ? draft.lines.map(function (line, index) {
          var speaker = project.characters.filter(function (item) { return item.id === line.speakerId; })[0];
          var label = speaker ? speaker.name : SG.typeMeta(line.type).label;
          return '<label class="draft-line"><span>【' + SG.esc(label) + '】</span><textarea data-action="draft-text" data-id="' + SG.esc(draft.id) + '" data-index="' + index + '" rows="2">' + SG.esc(line.text) + '</textarea><button type="button" data-action="delete-draft-line" data-id="' + SG.esc(draft.id) + '" data-index="' + index + '">删除这行</button></label>';
        }).join("")
      : '<pre class="raw">' + SG.esc(draft.raw) + '</pre><p class="hint tight">没有认出【】标记，原文留着，还不能采用。</p>';
    return '<article class="card">' +
      '<div class="card-head"><input class="name" data-action="draft-name" data-id="' + SG.esc(draft.id) + '" value="' + SG.esc(draft.name) + '" maxlength="40" placeholder="生成稿名称"><button type="button" data-action="delete-draft" data-id="' + SG.esc(draft.id) + '">删除</button></div>' +
      '<label class="check">文件夹<select data-action="move-draft" data-id="' + SG.esc(draft.id) + '">' + options + "</select></label>" +
      '<details' + (SG.ui.openId === draft.id ? " open" : "") + "><summary>正文</summary>" + body + "</details>" +
      (draft.parsed ? '<button type="button" data-action="adopt-draft" data-id="' + SG.esc(draft.id) + '">采用到当前' + (project.mode === "serial" ? "集" : "稿") + "</button>" : "") +
    "</article>";
  }

  function generate(project) {
    var settings = SG.settings();
    var structure = SG.activeStructure();
    var mode = project.mode || (structure.kind === "serial" ? "serial" : "short");
    var calls = mode === "serial" ? Math.max(project.episodes.length, 1) : 1;
    var episodes = project.mode === "serial" ? project.episodes.map(function (episode, index) {
      return '<article class="card"><label class="text-label">第' + (index + 1) + '集标题<input data-action="episode-title" data-id="' + SG.esc(episode.id) + '" value="' + SG.esc(episode.title) + '" maxlength="40"></label><label class="text-label">简介<textarea data-action="episode-summary" data-id="' + SG.esc(episode.id) + '" rows="3">' + SG.esc(episode.summary) + '</textarea></label><button type="button" data-action="generate-episode" data-id="' + SG.esc(episode.id) + '">生成这一集 · 将请求 1 次</button></article>';
    }).join("") : "";
    var folders = project.folders.map(function (folder) {
      return '<div class="card-head"><input class="name" data-action="folder-name" data-id="' + SG.esc(folder.id) + '" value="' + SG.esc(folder.name) + '" maxlength="32" placeholder="文件夹名"><button type="button" data-action="delete-folder" data-id="' + SG.esc(folder.id) + '">删除文件夹</button></div>';
    }).join("");
    var groups = "";
    [{ id: "", name: "未分类" }].concat(project.folders).forEach(function (folder) {
      var items = project.drafts.filter(function (draft) { return (draft.folderId || "") === folder.id; });
      if (!items.length && folder.id) return;
      groups += "<section class=\"block\"><h2>" + SG.esc(folder.name || "未分类") + "</h2>" + (items.length ? items.map(function (draft) { return draftCard(project, draft); }).join("") : '<p class="hint tight">这里还没有生成稿。</p>') + "</section>";
    });
    return '' +
      '<section class="block"><h2>接口</h2>' +
        '<label class="text-label">接口地址<input data-action="setting-url" value="' + SG.esc(settings.baseUrl) + '" placeholder="https://example.com/v1"></label>' +
        '<label class="text-label">模型<input data-action="setting-model" value="' + SG.esc(settings.model) + '" placeholder="模型名"></label>' +
        '<label class="text-label">密钥<input data-action="setting-key" type="password" value="' + SG.esc(settings.apiKey) + '" placeholder="' + (settings.hasKey ? "已保存" : "只留在这台设备，也会写入备份") + '"></label>' +
        '<div class="line-tools"><button type="button" data-action="fetch-models">拉取模型</button><button type="button" data-action="save-settings">保存接口</button></div>' +
        '<label class="text-label">核心提示词<textarea data-action="core-prompt" rows="3" placeholder="可空。有内容就放在发给模型的最前面。">' + SG.esc(project.corePrompt || "") + "</textarea></label>" +
        '<p class="hint tight">当前结构：' + SG.esc(structure.name || "未命名") + "。" + (project.mode ? "这个项目已定为" + (project.mode === "serial" ? "长篇" : "短篇") + "。" : "第一次生成后就固定，不随预设再变。") + "</p>" +
      "</section>" +
      (project.mode === "serial"
        ? '<section class="block"><h2>分集</h2>' + episodes + '<button type="button" data-action="generate-all">生成全部 · 将请求 ' + calls + " 次</button></section>"
        : '<section class="block"><h2>生成</h2><button type="button" class="primary" data-action="' + (mode === "serial" ? "generate-outline" : "generate-short") + '">' + (mode === "serial" ? "先生成各集标题和简介 · 将请求 1 次" : "生成这一场 · 将请求 1 次") + "</button></section>") +
      '<section class="block"><h2>文件夹</h2>' + folders + '<button type="button" data-action="add-folder">加文件夹</button><p class="hint tight">删除文件夹只把稿移回未分类。</p></section>' +
      groups;
  }

  function presets() {
    var styleId = SG.activeStyleId();
    var structureId = SG.activeStructureId();
    return '' +
      '<section class="block"><h2>文风</h2><p class="hint tight">内置乙女向广播剧不能删。自己的文风可以改、可以删。结构约束不写在这里。</p>' +
        presetList(SG.styles(), styleId, "style") +
        '<button type="button" class="add-end" data-action="add-style">加文风</button></section>' +
      '<section class="block"><h2>结构</h2><p class="hint tight">短篇小剧场和长篇分集只读。复制副本后再改，副本可以删除。这一步只保存，不生成。</p>' +
        presetList(SG.structures(), structureId, "structure") +
        '<button type="button" class="add-end" data-action="add-structure">加结构</button></section>';
  }

  function steps() {
    return '<ol class="steps">' + SG.STEPS.map(function (step) {
      return '<li class="' + step.state + '"><span>' + step.n + "</span><div><strong>" + SG.esc(step.title) + "</strong><p>" + SG.esc(step.text) + "</p></div></li>";
    }).join("") + "</ol>";
  }

  function sheet(kind, project) {
    if (!kind) return "";
    var title = "项目";
    var body = "";
    if (kind === "projects") {
      title = "项目";
      var list = SG.projects();
      body = list.length ? '<ul class="projects">' + list.map(function (item) {
        var active = project && item.id === project.id ? " active" : "";
        return '<li class="' + active + '"><button type="button" data-action="open-project" data-id="' + SG.esc(item.id) + '"><strong>' + SG.esc(item.name || "未命名广播剧") + "</strong><span>" + SG.esc(SG.formatTime(item.updatedAt)) + "</span></button></li>";
      }).join("") + "</ul>" : '<p class="hint">还没有别的项目。</p>';
      body += '<div class="sheet-actions"><button type="button" data-action="new-project">新建空白</button><button type="button" data-action="new-demo">放入示例</button></div>';
    } else if (kind === "steps") {
      title = "教程";
      body = '' +
        "<section class=\"block\"><h2>怎么走一遍</h2><p>先在预设里选文风和结构。角色卡、世界书写在各自的页面。生成的稿单独保存，确认后点采用，才会替换没锁定的行。</p><p>配音稿里可以临时勾掉一行。导出前再选格式。长篇可以勾选要放进同一个文件的集。</p></section>" +
        "<section class=\"block\"><h2>平台标签</h2><p>台词里用普通括号写标记名，例如：妈妈，(轻笑)我饿了。</p><p>换语音平台时，点复制模板。左边保留你在台词里写的名字，右边换成那个平台要的标记，保存成 txt，再导入。可以另存一套，也可以替换当前这套。</p><p>停顿可以写范围，例如 <#0.2-0.6#>。每次导出会在范围内随机取一个数。</p><p>导出时勾选平台标签，才会替换纯人声 TXT 和按角色拆开的 TXT。预设里没有的括号原样保留。</p></section>" +
        '<button type="button" data-action="copy-platform-template">复制标签模板</button>';
    } else if (kind === "backup") {
      title = "备份";
      body = '' +
        '<p class="hint">这是防丢用的项目文件，不是给语音平台的配音稿。配音稿在「配音稿」里复制。</p>' +
        '<div class="sheet-actions"><button type="button" class="primary" data-action="download-backup"' + (project ? "" : " disabled") + '>下载当前项目</button><label class="file">导入备份<input type="file" accept="application/json,.json" data-action="upload-backup"></label></div>' +
        (project ? '<button type="button" class="danger" data-action="delete-project" data-id="' + SG.esc(project.id) + '">删除当前项目</button>' : "");
    }
    return '' +
      '<div class="sheet-backdrop" data-action="close-sheet"></div>' +
      '<section class="sheet" role="dialog" aria-modal="true" aria-label="' + title + '">' +
        '<header><h2>' + title + '</h2><button type="button" data-action="close-sheet" aria-label="关闭">关闭</button></header>' +
        body +
      "</section>";
  }

  function editor(project) {
    var tab = SG.ui.tab;
    if (["director", "voice", "people", "books", "persona", "presets", "generate"].indexOf(tab) < 0) tab = "director";
    var panel = tab === "voice" ? voice(project) : tab === "people" ? people(project) : tab === "books" ? books(project) : tab === "persona" ? personas() : tab === "presets" ? presets() : tab === "generate" ? generate(project) : director(project);
    var save = SG.saveError();
    var tip = SG.tipHidden() ? "" : '<aside class="tip"><p>生成稿单独保存。采用时只替换没锁定的行。备份里有密钥，不要把文件发给别人。</p><button type="button" data-action="hide-tip">知道了</button></aside>';
    return '' +
        '<header class="top">' +
        '<button type="button" data-action="show-projects">项目</button>' +
        '<input class="title" data-action="rename" value="' + SG.esc(project.name) + '" maxlength="40" aria-label="项目名称">' +
        '<button type="button" data-action="show-backup">备份</button>' +
      "</header>" +
      '<div class="top-space"></div>' +
      (save ? '<p class="warn">' + SG.esc(save) + "</p>" : "") +
      tip +
      '<nav class="tabs" aria-label="编辑分区">' +
        '<button type="button"' + (tab === "generate" ? ' class="on"' : "") + ' data-action="tab" data-tab="generate">生成</button>' +
        '<button type="button"' + (tab === "presets" ? ' class="on"' : "") + ' data-action="tab" data-tab="presets">预设</button>' +
        '<button type="button"' + (tab === "director" ? ' class="on"' : "") + ' data-action="tab" data-tab="director">导演本</button>' +
        '<button type="button"' + (tab === "voice" ? ' class="on"' : "") + ' data-action="tab" data-tab="voice">配音稿</button>' +
        '<button type="button"' + (tab === "people" ? ' class="on"' : "") + ' data-action="tab" data-tab="people">角色</button>' +
        '<button type="button"' + (tab === "books" ? ' class="on"' : "") + ' data-action="tab" data-tab="books">世界书</button>' +
        '<button type="button"' + (tab === "persona" ? ' class="on"' : "") + ' data-action="tab" data-tab="persona">人设</button>' +
      "</nav>" +
      episodeBar(project) +
      '<main class="panel" data-panel="' + tab + '">' + panel + "</main>" +
      '<footer><button type="button" data-action="show-steps">教程</button></footer>' +
      sheet(SG.ui.sheet, project);
  }

  function render() {
    var app = document.getElementById("app");
    if (!app) return;
    var project = SG.current();
    var focus = document.activeElement;
    var focusId = focus && focus.getAttribute ? focus.getAttribute("data-id") : "";
    var focusAction = focus && focus.getAttribute ? focus.getAttribute("data-action") : "";
    var start = focus && typeof focus.selectionStart === "number" ? focus.selectionStart : null;
    var end = focus && typeof focus.selectionEnd === "number" ? focus.selectionEnd : null;
    app.innerHTML = editor(project);
    var currentTab = app.querySelector(".tabs .on");
    if (currentTab && currentTab.scrollIntoView) currentTab.scrollIntoView({ inline: "center", block: "nearest" });
    if (!focusAction) return;
    var next = app.querySelector('[data-action="' + focusAction + '"][data-id="' + focusId + '"]');
    if (!next) return;
    next.focus();
    if (start != null && next.setSelectionRange) {
      try { next.setSelectionRange(start, end); } catch (err) {}
    }
  }

  SG.render = render;
})();
