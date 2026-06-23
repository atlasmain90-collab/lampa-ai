(function () {
  'use strict';
  if (window.plugin_ai_test) return;
  window.plugin_ai_test = true;
  function add() {
    var ico = '<svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>';
    var item = $(
      '<li class="menu__item selector" data-action="ai_test">' +
        '<div class="menu__ico">' + ico + '</div>' +
        '<div class="menu__text">AI Тест</div>' +
      '</li>'
    );
    item.on('hover:enter', function () {
      Lampa.Noty.show('AI плагин работает!');
    });
    $('.menu .menu__list').eq(0).append(item);
  }
  if (window.appready) {
    add();
  } else {
    Lampa.Listener.follow('app', function (e) {
      if (e.type === 'ready') add();
    });
  }
})();
