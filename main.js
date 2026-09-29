(function () {
  "use strict";
  var SG = window.SG;
  var undo = null;
  var timer = 0;

  function render() {
    SG.render();
  }

  function remember() {
    undo = SG.snapshot();
  }

  function toast(message, canUndo, sticky) {
    var box = document.getElementById("toast");
    var text = document.getElementById("toast-text");
    var button = document.getElementById("toast-undo");
    if (!box || !text || !button) return;
    text.textContent = message;
    button.hidden = !canUndo;
    box.hidden = false;
    clearTimeout(timer);
    if (!sticky) timer = setTimeout(function () { box.hidden = true; }, canUndo ? 5000 : 2200);
  }

  function changed(message) {
    render();
    if (message) toast(message, !!undo);
    else undo = null;
  }

  function field(event) {
    var el = event.target;
    if (!el || !el.getAttribute) return;
    var action = el.getAttribute("data-action");
    var id = el.getAttribute("data-id");
    if (action === "line-text") SG.setText(id, el.value);
    else if (action === "line-emotion") SG.setEmotion(id, el.value);
    else if (action === "character-body") SG.setCharacterBody(id, el.value);
    else if (action === "book-body") SG.setBookBody(id, el.value);
    else if (action === "persona-body") SG.setPersonaBody(id, el.value);
    else if (action === "style-text") SG.setStyleText(id, el.value);
    else if (action === "structure-text") SG.setStructureText(id, el.value);
    else if (action === "setting-model-text") SG.saveSettings({ model: el.value });
    else if (action === "setting-key") SG.saveSettings({ apiKey: el.value });
    else if (action === "setting-url") SG.saveSettings({ baseUrl: el.value });
    else if (action === "platform-text") SG.setPlatformText(id, el.value);
    else if (action === "core-prompt") SG.setCorePrompt(el.value);
    else if (action === "story-prompt") SG.setStoryPrompt(el.value);
    else if (action === "rename") SG.rename(el.value);
    else return;
    undo = null;
  }

  function named(action, id, value) {
    try {
      if (action === "character-name") SG.setCharacterName(id, value);
      else if (action === "book-name") SG.setBookName(id, value);
      else if (action === "persona-name") SG.setPersonaName(id, value);
      else if (action === "style-name") SG.setStyleName(id, value);
      else if (action === "structure-name") SG.setStructureName(id, value);
      else if (action === "profile-name") SG.setProfileName(id, value);
      else if (action === "platform-name") SG.setPlatformName(id, value);
      else return false;
      undo = null;
      return true;
    } catch (err) {
      if (err && err.code === "duplicate-name") toast("已经有同名的了，换一个名字", false);
      else toast("名字没能保存", false);
      render();
      return true;
    }
  }

  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || "")); };
      reader.onerror = function () { reject(new Error("读不到这个文件")); };
      reader.readAsText(file);
    });
  }

  function promptText(context) {
    var blocks = [];
    if (context.core) blocks.push("核心要求：\n" + context.core);
    if (context.story) blocks.push("这次的情节：\n" + context.story + "\n按这个情节写。");
    blocks.push("文风：\n" + context.style);
    blocks.push("结构：\n" + context.structure);
    if (context.persona) blocks.push("用户人设：\n" + context.persona);
    if (context.characters) blocks.push("出场角色：\n" + context.characters);
    if (context.books) blocks.push("世界书：\n" + context.books);
    if (context.kind === "outline") {
      blocks.push("先只写分集。结构没有规定集数时，按故事需要决定集数，不要为了凑数拆得很碎。每一集用「第 1 集：标题」开头，下一行写简介。不要写台词。");
    } else {
      if (context.episode) blocks.push("这一集：\n" + context.episode);
      if (context.previous) blocks.push("上一集结尾：\n" + context.previous);
      if (context.next) blocks.push("下一集开头：\n" + context.next);
      if (context.locked) blocks.push("这些行已锁定，不要改写：\n" + context.locked);
      blocks.push("按这个格式回稿：\n【林夏】\n你还没走。\n情绪：放轻\n我以为末班车会在路口等。\n\n【旁白】\n夜班公交已经停了。");
      var platform = SG.activePlatform();
      var marks = platform && platform.rows ? platform.rows.map(function (row) { return row.name; }).filter(Boolean) : [];
      if (marks.length) blocks.push("视上下文语境，在台词中用普通括号加入语气、声音或停顿。括号里只能有指定标记名，不能有其他文字，例如：妈妈，(轻笑)我饿了。可用标记名：" + marks.join("、") + "。不要每句都加，不适合语境就不要加。描写、解释和平台符号都不要写进括号。");
    }
    return blocks.join("\n\n");
  }

  function requestModel(context) {
    var settings = SG.settings();
    if (!settings.baseUrl || !settings.model || !settings.apiKey) return Promise.reject(new Error("接口还没填完整"));
    return fetch(settings.baseUrl + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + settings.apiKey },
      body: JSON.stringify({
        model: settings.model,
        messages: [{ role: "user", content: promptText(context) }]
      })
    }).then(function (response) {
      if (!response.ok) throw new Error("接口返回 " + response.status);
      return response.json();
    }).then(function (data) {
      var text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (!text) throw new Error("接口没有返回正文");
      return String(text);
    });
  }

  function ask(message) {
    return Promise.resolve(window.confirm(message));
  }

  function readMaterial(file) {
    var name = String(file && file.name || "").toLowerCase();
    if (name.endsWith(".docx")) {
      if (!window.SGDocx) return Promise.reject(new Error("读不到 docx"));
      return window.SGDocx.textFromDocx(file);
    }
    if (name.endsWith(".doc")) return Promise.reject(new Error("只收 txt 和 docx"));
    return readFile(file);
  }

  function focusName(action, id) {
    var input = document.querySelector('[data-action="' + action + '"][data-id="' + id + '"]');
    if (input) input.focus();
  }

  function download(filename, content, type) {
    var blob = content instanceof Blob ? content : new Blob([content], { type: type || "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function exportFiles() {
    var project = SG.current();
    if (!project) return;
    var choices = SG.ui.exportChoices || { html: true, voice: true, roles: true, tags: false };
    var ids = [];
    if (project.mode === "serial") {
      project.episodes.forEach(function (episode) {
        if (!SG.ui.exportEpisodes || SG.ui.exportEpisodes[episode.id] !== false) ids.push(episode.id);
      });
      if (!ids.length) { toast("先勾选至少一集", false); return; }
    }
    var base = SG.safeName(project.name);
    var files = [];
    if (choices.html) files.push({ name: base + "-完整本.html", text: SG.fullHtml(project, ids) });
    if (choices.voice) files.push({ name: base + "-人声.txt", text: SG.voiceText(project, ids, SG.ui.voiceOmit || {}, !!choices.tags) });
    if (choices.roles) {
      var roles = SG.roleTexts(project, ids, !!choices.tags);
      if (!roles.length) toast("勾选的音轨里没有角色台词", false);
      else roles.forEach(function (file) { files.push(file); });
    }
    if (!files.length) return;
    if (files.length === 1) {
      download(files[0].name, files[0].text);
      toast("已开始下载", false);
      return;
    }
    download(base + "-导出.zip", window.SGZip.zip(files), "application/zip");
    toast("已打包成一个压缩包", false);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.left = "-9999px";
      document.body.appendChild(area);
      area.select();
      try {
        if (!document.execCommand("copy")) throw new Error("copy failed");
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        area.remove();
      }
    });
  }

  function onClick(event) {
    var el = event.target.closest("[data-action]");
    if (!el || el.disabled) return;
    var action = el.getAttribute("data-action");
    var id = el.getAttribute("data-id");
    if (action === "tab") {
      SG.ui.tab = el.getAttribute("data-tab");
      render();
      var current = document.querySelector(".tabs .on");
      if (current && current.scrollIntoView) current.scrollIntoView({ inline: "center", block: "nearest" });
      return;
    }
    if (action === "show-projects") { SG.ui.sheet = "projects"; render(); return; }
    if (action === "show-steps") { SG.ui.sheet = "steps"; render(); return; }
    if (action === "show-backup") { SG.ui.sheet = "backup"; render(); return; }
    if (action === "close-sheet") { SG.ui.sheet = null; render(); return; }
    if (action === "hide-tip") { SG.hideTip(); render(); return; }
    if (action === "undo") {
      if (!undo) return;
      try { SG.restore(undo); } catch (err) { toast("撤销没有成功", false); return; }
      undo = null;
      SG.ui.sheet = null;
      render();
      toast("已撤销", false);
      return;
    }
    if (action === "new-project") {
      remember();
      SG.addProject(SG.blankProject("未命名广播剧"));
      SG.ui.tab = "people";
      SG.ui.sheet = null;
      changed("已新建项目");
      return;
    }
    if (action === "new-demo") {
      remember();
      SG.addProject(SG.createDemo());
      SG.ui.tab = "director";
      SG.ui.sheet = null;
      changed("已放入示例");
      return;
    }
    if (action === "open-project") {
      SG.openProject(id);
      SG.ui.sheet = null;
      render();
      return;
    }
    if (action === "delete-project") {
      var project = SG.current();
      var name = project ? project.name || "未命名广播剧" : "这个项目";
      if (!window.confirm("删除「" + name + "」？这台设备上的这一份会去掉。")) return;
      remember();
      SG.deleteProject(id);
      SG.ui.sheet = null;
      changed("已删除项目");
      return;
    }
    if (action === "add-line") {
      var created = SG.addLine();
      render();
      focusLine(created);
      return;
    }
    if (action === "insert-line") {
      var inserted = SG.insertAfter(id);
      render();
      focusLine(inserted);
      return;
    }
    if (action === "delete-line") {
      remember();
      SG.deleteLine(id);
      changed("已删除这一行");
      return;
    }
    if (action === "move-line") {
      SG.moveLine(id, Number(el.getAttribute("data-dir")) || 0);
      render();
      return;
    }
    if (action === "toggle-voice") { SG.toggleVoice(id); render(); return; }
    if (action === "toggle-lock") { SG.toggleLock(id); render(); return; }
    if (action === "add-character") {
      var person = SG.addCharacter();
      render();
      focusName("character-name", person);
      return;
    }
    if (action === "delete-character") {
      remember();
      SG.deleteCharacter(id);
      changed("已删除角色");
      return;
    }
    if (action === "add-book") {
      var book = SG.addBook();
      render();
      focusName("book-name", book);
      return;
    }
    if (action === "delete-book") {
      remember();
      SG.deleteBook(id);
      changed("已删除世界书");
      return;
    }
    if (action === "add-persona") {
      var persona = SG.addPersona();
      render();
      focusName("persona-name", persona);
      return;
    }
    if (action === "delete-persona") {
      remember();
      SG.deletePersona(id);
      changed("已删除人设");
      return;
    }
    if (action === "use-persona") { SG.usePersona(id); render(); return; }
    if (action === "add-style") {
      var style = SG.addStyle();
      render();
      focusName("style-name", style);
      return;
    }
    if (action === "copy-style") {
      var styleCopy = SG.duplicateStyle(id);
      render();
      focusName("style-name", styleCopy);
      return;
    }
    if (action === "delete-style") {
      if (!SG.deleteStyle(id)) { toast("内置文风不能删", false); return; }
      render();
      toast("已删除文风", false);
      return;
    }
    if (action === "use-style") { SG.useStyle(id); render(); return; }
    if (action === "add-structure") {
      var structure = SG.addStructure();
      render();
      focusName("structure-name", structure);
      return;
    }
    if (action === "copy-structure") {
      var structureCopy = SG.duplicateStructure(id);
      render();
      focusName("structure-name", structureCopy);
      return;
    }
    if (action === "delete-structure") {
      if (!SG.deleteStructure(id)) { toast("内置结构不能删", false); return; }
      render();
      toast("已删除结构", false);
      return;
    }
    if (action === "use-structure") { SG.useStructure(id); render(); return; }
    if (action === "open-episode") { SG.openEpisode(id); render(); return; }
    if (action === "add-folder") { var folder = SG.addFolder(); render(); focusName("folder-name", folder); return; }
    if (action === "delete-folder") { SG.deleteFolder(id); render(); toast("里面的稿已移到未分类", false); return; }
    if (action === "delete-draft") { SG.deleteDraft(id); render(); return; }
    if (action === "delete-draft-line") { SG.deleteDraftLine(id, Number(el.getAttribute("data-index"))); render(); return; }
    if (action === "adopt-draft") {
      ask("采用这份稿，会替换当前没锁定的行。锁定的行不动。").then(function (ok) {
        if (!ok) return;
        if (!SG.adoptDraft(id)) { toast("这份稿还不能采用", false); return; }
        SG.ui.tab = "director";
        changed("已采用");
      });
      return;
    }
    if (action === "fetch-models") {
      var urlInput = document.querySelector('[data-action="setting-url"]');
      var keyInput = document.querySelector('[data-action="setting-key"]');
      var modelInput = document.querySelector('[data-action="setting-model-text"]');
      var settings = SG.saveSettings({
        baseUrl: urlInput ? urlInput.value : SG.settings().baseUrl,
        apiKey: keyInput ? keyInput.value : SG.settings().apiKey,
        model: modelInput ? modelInput.value : SG.settings().model
      });
      if (!settings.baseUrl || !settings.apiKey) { toast("先填接口地址和密钥", false); return; }
      fetch(settings.baseUrl + "/models", { headers: { Authorization: "Bearer " + settings.apiKey } }).then(function (response) {
        return response.text().then(function (body) {
          var data = {};
          try { data = JSON.parse(body); } catch (err) {}
          if (!response.ok) {
            var detail = data && data.error ? (data.error.message || JSON.stringify(data.error)) : body;
            throw new Error("接口返回 " + response.status + (detail ? "：" + String(detail).replace(/\s+/g, " ").slice(0, 240) : ""));
          }
          return data;
        });
      }).then(function (data) {
        var names = ((data && data.data) || []).map(function (item) { return item.id; }).filter(Boolean);
        if (!names.length) throw new Error("接口没有返回模型列表");
        SG.saveSettings({ model: names[0], models: names });
        render();
        toast("已拉取 " + names.length + " 个模型", false);
      }).catch(function (err) { toast(err && err.message ? err.message : "没能拉取，可以手填模型名", false, true); });
      return;
    }
    if (action === "add-profile") { var profile = SG.addProfile(); render(); focusName("profile-name", profile); return; }
    if (action === "delete-profile") {
      if (!SG.deleteProfile(id)) { toast("至少留一套接口", false); return; }
      render();
      return;
    }
    if (action === "copy-platform") { var platformCopy = SG.duplicatePlatform(id); render(); focusName("platform-name", platformCopy); return; }
    if (action === "delete-platform") {
      if (!SG.deletePlatform(id)) { toast("内置预设不能删", false); return; }
      render();
      return;
    }
    if (action === "use-platform") { SG.usePlatform(id); render(); return; }
    if (action === "generate-outline" || action === "generate-short" || action === "generate-episode" || action === "generate-all") {
      runGenerate(action, id);
      return;
    }
    if (action === "copy-voice") {
      var current = SG.current();
      var text = current ? SG.analyze(current).text : "";
      if (!text) return;
      copyText(text).then(function () {
        toast("配音稿已复制", false);
      }).catch(function () {
        toast("没能复制，请长按配音稿手动选择", false);
      });
      return;
    }
    if (action === "download-backup") {
      var data = SG.exportProject();
      if (!data) return;
      download(SG.safeName(data.project.name) + ".shenggao.json", JSON.stringify(data, null, 2));
      toast("已开始下载", false);
    }
  }

  function runGenerate(action, id) {
    var project = SG.current();
    if (!project) return;
    var count = action === "generate-all" ? project.episodes.length : 1;
    if (!count) { toast("还没有分集", false); return; }
    window.SGPending = "正在请求接口，请稍等";
    render();
    var job;
      if (action === "generate-outline") job = requestModel(SG.generationContext("outline")).then(function (text) {
        var items = SG.parseOutline(text);
        if (!items.length) throw new Error("没有认出分集");
        SG.saveOutline(items);
        SG.saveDraft(text, "分集大纲", "");
      });
      else if (action === "generate-short") job = requestModel(SG.generationContext("script")).then(function (text) {
        SG.saveDraft(text, "短篇生成稿", "");
      });
      else if (action === "generate-episode") job = requestModel(SG.generationContext("script", project.episodes.filter(function (item) { return item.id === id; })[0])).then(function (text) {
        SG.saveDraft(text, "单集生成稿", "");
      });
      else {
        var index = 0;
        job = Promise.resolve();
        project.episodes.forEach(function (episode) {
          job = job.then(function () {
            index += 1;
            window.SGPending = "正在请求 " + index + " / " + count;
            render();
            return requestModel(SG.generationContext("script", episode)).then(function (text) {
              SG.saveDraft(text, episode.title || ("第" + index + "集"), "");
            });
          });
        });
      }
    job.then(function () {
        window.SGPending = "";
        render();
        toast("已保存生成稿", false);
      }).catch(function (err) {
        window.SGPending = "";
        render();
        toast(err && err.message ? err.message : "请求停了，已经得到的稿还在", false, true);
      });
  }

  function focusLine(id) {
    var area = document.querySelector('[data-action="line-text"][data-id="' + id + '"]');
    if (area) area.focus();
  }

  function onChange(event) {
    var el = event.target;
    if (!el || !el.getAttribute) return;
    var action = el.getAttribute("data-action");
    var id = el.getAttribute("data-id");
    if (action === "line-type") { SG.setLineType(id, el.value); render(); return; }
    if (action === "line-speaker") { SG.setSpeaker(id, el.value); render(); return; }
    if (action === "character-color") { SG.setCharacterColor(id, el.value); render(); return; }
    if (action === "monologue") { SG.setIncludeMonologue(el.checked); render(); return; }
    if (action === "omit-voice") {
      if (!SG.ui.voiceOmit) SG.ui.voiceOmit = {};
      if (el.checked) delete SG.ui.voiceOmit[id];
      else SG.ui.voiceOmit[id] = true;
      render();
      return;
    }
    if (action === "use-profile") { SG.useProfile(el.value); render(); return; }
    if (action === "setting-model") { SG.saveSettings({ model: el.value }); return; }
    if (action === "export-choice") {
      if (!SG.ui.exportChoices) SG.ui.exportChoices = { html: true, voice: true, roles: true, tags: false };
      SG.ui.exportChoices[el.getAttribute("data-kind")] = el.checked;
      render();
      return;
    }
    if (action === "export-episode") {
      if (!SG.ui.exportEpisodes) SG.ui.exportEpisodes = {};
      SG.ui.exportEpisodes[id] = el.checked;
      return;
    }
    if (action === "export-files") { exportFiles(); return; }
    if (action === "copy-platform-template") {
      copyText(SG.platformTemplate());
      toast("模板已复制。左边是台词里的名字，右边是平台标记。", false);
      return;
    }
    if (action === "platform-help") {
      var help = document.getElementById("platform-help");
      if (help) help.hidden = !help.hidden;
      return;
    }
    if (action === "link-book") {
      SG.toggleBookLink(el.getAttribute("data-id"), el.getAttribute("data-book"));
      render();
      return;
    }
    if (action === "cast") {
      SG.toggleCast(el.getAttribute("data-id"));
      render();
      return;
    }
    if (action === "upload-material" || action === "upload-persona") {
      var material = el.files && el.files[0];
      var kind = el.getAttribute("data-kind") || "character";
      el.value = "";
      if (!material) return;
      readMaterial(material).then(function (text) {
        var prepared = SG.prepareText(text);
        if (!prepared.text) { toast("这份文件没有正文", false); return; }
        remember();
        var created;
        try {
          created = action === "upload-persona" ? SG.importPersona(prepared.text) : SG.importMaterial(kind, prepared.text, material.name);
        } catch (err) {
          toast(err && err.code === "duplicate-name" ? "已经有同名的了，换一个文件名" : "没有导入", false);
          return;
        }
        changed(prepared.truncated ? "已导入前 20000 字，后面没有收" : "已导入");
        if (action === "upload-persona") focusName("persona-name", created);
        else focusName(kind === "book" ? "book-name" : "character-name", created);
      }).catch(function () {
        toast("只收 txt 和 docx 的正文", false);
      });
      return;
    }
    if (action === "upload-platform") {
      var preset = el.files && el.files[0];
      el.value = "";
      if (!preset) return;
      readFile(preset).then(function (text) {
        var rows = SG.parsePlatform(text);
        if (!rows.length) { toast("没有认出标签。一行写：名字 标记", false); return; }
        var current = SG.activePlatform();
        var mode = current && window.confirm("替换当前这套「" + (current.name || "未命名") + "」吗？点取消则另存一套。") ? "replace" : "new";
        var fallback = String(preset.name || "平台标签").replace(/\.txt$/i, "");
        var name = window.prompt("预设名称", mode === "replace" ? current.name : fallback);
        if (!name) return;
        try {
          SG.savePlatform(name, text, mode === "replace" ? current.id : "");
          render();
          toast(mode === "replace" ? "已替换当前预设" : "已另存一套预设", false);
        } catch (err) {
          toast(err && err.code === "duplicate-name" ? "已经有同名预设" : "预设没有保存", false);
        }
      }).catch(function () { toast("读不到这个文件", false); });
      return;
    }
    if (action === "upload-backup") {
      var file = el.files && el.files[0];
      el.value = "";
      if (!file) return;
      readFile(file).then(function (text) {
        var data = JSON.parse(text);
        remember();
        var imported = SG.importProject(data);
        SG.ui.tab = "director";
        SG.ui.sheet = null;
        changed("已导入备份");
        if (imported && imported.hasKey) {
          ask("这份备份里有密钥。用它覆盖这台设备上的密钥吗？").then(function (ok) {
            if (ok) SG.applyBackupSettings(data);
            render();
          });
        }
      }).catch(function () {
        toast("这个文件不是台本工作室备份", false);
      });
    }
  }

  document.addEventListener("pointerdown", function (event) {
    var hit = event.target.closest && event.target.closest("[data-action]");
    if (hit && hit.getAttribute("data-action") === "export-files") {
      exportFiles();
      event.preventDefault();
      return;
    }
    if (hit && hit.getAttribute("data-action") === "platform-help") {
      var panel = document.getElementById("platform-help");
      if (panel) panel.hidden = !panel.hidden;
      event.preventDefault();
      return;
    }
    var box = document.getElementById("toast");
    if (!box || box.hidden || box.contains(event.target)) return;
    box.hidden = true;
  });
  document.addEventListener("click", function (event) {
    var hit = event.target.closest && event.target.closest("[data-action]");
    var action = hit && hit.getAttribute("data-action");
    if (action === "export-files" || action === "platform-help") return;
    onClick(event);
  });
  document.addEventListener("touchstart", function (event) {
    if (event.touches && event.touches.length > 1) event.preventDefault();
  }, { passive: false });
  document.addEventListener("gesturestart", function (event) { event.preventDefault(); });
  document.addEventListener("input", field);
  document.addEventListener("change", function (event) {
    var el = event.target;
    if (!el || !el.getAttribute) return;
    var action = el.getAttribute("data-action");
    if (action === "character-name" || action === "book-name" || action === "persona-name" || action === "style-name" || action === "structure-name" || action === "profile-name" || action === "platform-name") {
      named(action, el.getAttribute("data-id"), el.value);
      return;
    }
    onChange(event);
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && SG.ui.sheet) {
      SG.ui.sheet = null;
      render();
    }
  });

  if (SG.testErrors && SG.testErrors.length) {
    var app = document.getElementById("app");
    if (app) app.innerHTML = '<main class="home"><h1>配音稿规则没有通过自测</h1><pre class="script">' + SG.esc(SG.testErrors.join("\n")) + "</pre></main>";
    return;
  }
  render();
})();
