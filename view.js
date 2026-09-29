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
    if (!project.lines.length) {
      return '<div class="empty"><p>还没有台词。</p><button type="button" class="primary" data-action="add-line">写第一行</button></div>';
    }
    return project.lines.map(function (line, index) {
      return lineCard(project, line, index, project.lines.length);
    }).join("") + '<button type="button" class="add-end" data-action="add-line">加一行</button>';
  }

  function voice(project) {
    var result = SG.analyze(project);
    var counts = result.excludedByType;
    var excluded = counts.narration + counts.sfx + counts.action + counts.dialogue + counts.monologue;
    var note = result.includeMonologue ? "内心独白算人声" : "内心独白这次不念";
    var warning = result.unnamed ? '<p class="warn">' + result.unnamed + " 行对白或独白还没有角色名，配音稿里暂时不加【】。</p>" : "";
    var body = result.text
      ? '<pre class="script">' + SG.esc(result.text) + "</pre>"
      : '<div class="empty"><p>配音稿还是空的。把对白标成「要念」，或者打开内心独白。</p></div>';
    return '' +
      '<div class="voice-bar">' +
        "<div><strong>" + result.voiceCount + " 行要念</strong><span>已去掉 " + excluded + " 行</span></div>" +
        '<label class="switch"><input type="checkbox" data-action="monologue"' + (project.includeMonologue !== false ? " checked" : "") + "><span>" + note + "</span></label>" +
        '<button type="button" class="primary" data-action="copy-voice"' + (result.text ? "" : " disabled") + ">复制配音稿</button>" +
      "</div>" +
      warning +
      '<p class="hint">同一角色连续说，只在这一轮开头标一次名字。名字单独占一行，下一行是台词。中间被去掉的旁白、音效不算换人。情绪不会出现在这里。</p>' +
      body;
  }

  function people(project) {
    var cards = project.characters.map(function (character, index) {
      return '' +
        '<article class="person">' +
          '<input class="name" data-action="character-name" data-id="' + SG.esc(character.id) + '" value="' + SG.esc(character.name) + '" maxlength="32" placeholder="角色名">' +
          '<button type="button" data-action="delete-character" data-id="' + SG.esc(character.id) + '">删除</button>' +
        "</article>";
    }).join("");
    if (!cards) cards = '<div class="empty"><p>还没有角色。配音稿里用角色名区分说话人。</p></div>';
    return cards + '<button type="button" class="add-end" data-action="add-character">加角色</button>';
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
      title = "还没做完的";
      body = steps() + '<p class="hint">现在可用的是逐行编辑。导入、生成和正式导出还没开始。没叫推送或部署，就不会做。</p>';
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

  function home() {
    return '' +
      '<main class="home">' +
        "<p class=\"mark\">台本工作室</p>" +
        "<h1>先把要念的话分开。</h1>" +
        "<p>导演本留着旁白、音效和情绪。配音本只留人声，同一角色连续说时只在开头标一次名字。</p>" +
        '<div class="home-actions"><button type="button" class="primary" data-action="new-project">新建项目</button><button type="button" data-action="new-demo">看一份示例</button></div>' +
        '<label class="file wide">导入已有备份<input type="file" accept="application/json,.json" data-action="upload-backup"></label>' +
      "</main>";
  }

  function editor(project) {
    var tab = SG.ui.tab;
    if (tab !== "director" && tab !== "voice" && tab !== "people") tab = "director";
    var panel = tab === "voice" ? voice(project) : tab === "people" ? people(project) : director(project);
    var save = SG.saveError();
    var tip = SG.tipHidden() ? "" : '<aside class="tip"><p>这是第 1 步。可以手工写、改、看配音稿。导入资料和模型生成还没接上。</p><button type="button" data-action="hide-tip">知道了</button></aside>';
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
        '<button type="button"' + (tab === "director" ? ' class="on"' : "") + ' data-action="tab" data-tab="director">导演本</button>' +
        '<button type="button"' + (tab === "voice" ? ' class="on"' : "") + ' data-action="tab" data-tab="voice">配音稿</button>' +
        '<button type="button"' + (tab === "people" ? ' class="on"' : "") + ' data-action="tab" data-tab="people">角色</button>' +
      "</nav>" +
      '<main class="panel" data-panel="' + tab + '">' + panel + "</main>" +
      '<footer><button type="button" data-action="show-steps">工作顺序</button><span>第 1 步 · 逐行编辑</span></footer>' +
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
    app.innerHTML = project ? editor(project) : home();
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
