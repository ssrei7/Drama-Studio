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

  function toast(message, canUndo) {
    var box = document.getElementById("toast");
    var text = document.getElementById("toast-text");
    var button = document.getElementById("toast-undo");
    if (!box || !text || !button) return;
    text.textContent = message;
    button.hidden = !canUndo;
    box.hidden = false;
    clearTimeout(timer);
    timer = setTimeout(function () { box.hidden = true; }, canUndo ? 5000 : 2200);
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
    else if (action === "character-name") SG.setCharacterName(id, el.value);
    else if (action === "rename") SG.rename(el.value);
    else return;
    undo = null;
  }

  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || "")); };
      reader.onerror = function () { reject(new Error("读不到这个文件")); };
      reader.readAsText(file);
    });
  }

  function download(filename, text) {
    var blob = new Blob([text], { type: "application/json;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
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
      var input = document.querySelector('[data-action="character-name"][data-id="' + person + '"]');
      if (input) input.focus();
      return;
    }
    if (action === "delete-character") {
      remember();
      SG.deleteCharacter(id);
      changed("已删除角色");
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
    if (action === "upload-backup") {
      var file = el.files && el.files[0];
      el.value = "";
      if (!file) return;
      readFile(file).then(function (text) {
        var data = JSON.parse(text);
        remember();
        SG.importProject(data);
        SG.ui.tab = "director";
        SG.ui.sheet = null;
        changed("已导入备份");
      }).catch(function () {
        toast("这个文件不是台本工作室备份", false);
      });
    }
  }

  document.addEventListener("click", onClick);
  document.addEventListener("input", field);
  document.addEventListener("change", onChange);
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
