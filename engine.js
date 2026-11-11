(function () {
  "use strict";

  var pending = false;
  var comp = null;
  var vals = {};
  var bindings = [];
  var lists = [];
  var ifs = [];

  window.DCLogic = function DCLogic() {
    this.props = {};
    this.state = null;
  };
  window.DCLogic.prototype.setState = function (patch) {
    var next = typeof patch === "function" ? patch(this.state || {}) : patch;
    this.state = Object.assign({}, this.state || {}, next);
    schedule();
  };
  window.DCLogic.prototype.forceUpdate = function () { schedule(); };

  function schedule() {
    if (pending) return;
    pending = true;
    Promise.resolve().then(function () { pending = false; render(); });
  }

  function resolve(path, scope) {
    path = path.trim();
    if (path === "true") return true;
    if (path === "false") return false;
    var parts = path.split(".");
    var v = scope[parts[0]];
    for (var i = 1; i < parts.length; i++) {
      if (v === null || v === undefined) return "";
      v = v[parts[i]];
    }
    return v;
  }

  function interp(tpl, scope) {
    var whole = tpl.match(/^\s*\{\{([^}]+)\}\}\s*$/);
    if (whole) return resolve(whole[1], scope);
    return tpl.replace(/\{\{([^}]+)\}\}/g, function (m, p) {
      var v = resolve(p, scope);
      return v === null || v === undefined ? "" : String(v);
    });
  }

  var EVENTS = { "data-on-click": "click", "data-on-change": "input", "data-on-submit": "submit" };

  function bindTree(root, scopeFn, owned) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    var node = root;
    var todo = [];
    while (node) {
      todo.push(node);
      node = walker.nextNode();
    }
    todo.forEach(function (n) {
      if (n.nodeType === 3) {
        if (n.nodeValue.indexOf("{{") !== -1) owned.push({ kind: "text", node: n, tpl: n.nodeValue, scope: scopeFn });
        return;
      }
      if (n.tagName === "TEMPLATE" && n.hasAttribute("data-list")) {
        lists.push({ tpl: n, name: n.getAttribute("data-list"), as: n.getAttribute("data-as"), items: [], scope: scopeFn });
        return;
      }
      if (n.hasAttribute && n.hasAttribute("data-if")) {
        ifs.push({ node: n, path: n.getAttribute("data-if"), scope: scopeFn });
      }
      Array.prototype.slice.call(n.attributes || []).forEach(function (a) {
        if (EVENTS[a.name]) {
          var path = a.value.replace(/[{}]/g, "");
          n.addEventListener(EVENTS[a.name], function (e) {
            var fn = resolve(path, scopeFn());
            if (typeof fn === "function") fn(e);
          });
          n.removeAttribute(a.name);
        } else if (a.value.indexOf("{{") !== -1) {
          owned.push({ kind: "attr", node: n, name: a.name, tpl: a.value, scope: scopeFn });
        }
      });
    });
  }

  function applyBinding(b) {
    var v = interp(b.tpl, b.scope());
    if (b.kind === "text") {
      var s = v === null || v === undefined ? "" : String(v);
      if (b.node.nodeValue !== s) b.node.nodeValue = s;
      return;
    }
    var el = b.node;
    if (b.name === "disabled") {
      if (v === true || v === "true") el.setAttribute("disabled", ""); else el.removeAttribute("disabled");
      return;
    }
    var str = v === null || v === undefined ? "" : String(v);
    if (el.getAttribute(b.name) !== str) el.setAttribute(b.name, str);
    if (b.name === "value" && "value" in el && el.value !== str) el.value = str;
  }

  function renderList(l) {
    var arr = resolve(l.name, l.scope()) || [];
    if (l.items.length !== arr.length) {
      l.items.forEach(function (it) { it.nodes.forEach(function (n) { n.remove(); }); });
      l.items = [];
      arr.forEach(function (_, i) {
        var frag = l.tpl.content.cloneNode(true);
        var nodes = Array.prototype.slice.call(frag.childNodes);
        var owned = [];
        var scopeFn = (function (idx) {
          return function () {
            var base = l.scope();
            var s = Object.assign({}, base);
            var list = resolve(l.name, base) || [];
            s[l.as] = list[idx];
            s.$index = idx;
            return s;
          };
        })(i);
        nodes.forEach(function (n) { if (n.nodeType === 1 || n.nodeType === 3) bindTree(n, scopeFn, owned); });
        l.tpl.parentNode.insertBefore(frag, l.tpl);
        l.items.push({ nodes: nodes, owned: owned });
      });
    }
    l.items.forEach(function (it) { it.owned.forEach(applyBinding); });
  }

  function render() {
    vals = comp.renderVals() || {};
    ifs.forEach(function (f) {
      var show = !!resolve(f.path.replace(/[{}]/g, ""), f.scope());
      if (show) f.node.removeAttribute("hidden"); else f.node.setAttribute("hidden", "");
    });
    bindings.forEach(applyBinding);
    lists.slice().forEach(renderList);
  }

  window.mountPage = function (Component) {
    comp = new Component();
    comp.props = {};
    var root = document.getElementById("app");
    bindTree(root, function () { return vals; }, bindings);
    render();
    if (typeof comp.componentDidMount === "function") comp.componentDidMount();
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      var st = comp.state || {};
      if (st.modalOpen || st.gameOpen) comp.setState({ modalOpen: false, gameOpen: false });
    });
  };
})();
