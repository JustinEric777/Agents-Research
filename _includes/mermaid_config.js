{%- comment -%}
  mermaid 的初始化配置。本文件被主题的 components/mermaid.html 以
  `var config = {% include mermaid_config.js %};` 内联进页面，所以必须是
  一个**表达式**——这里用 IIFE 返回对象，好在里面读一次当前配色。
{%- endcomment -%}
(function () {
  // 明暗两种模式各有一套内置配色：浅色用 neutral（透明底）、深色用 dark。
  // mermaid 只在初始化时读颜色，之后颜色就写死在生成的 SVG 里了，所以切换
  // 主题时含图的页面会刷新一次（见 _includes/header_custom.html）。
  var dark = document.documentElement.getAttribute("data-theme") === "dark";

  return {
    startOnLoad: false,
    theme: dark ? "dark" : "neutral",
    securityLevel: "loose",
    fontFamily: '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif',
    themeVariables: {
      fontSize: "14px",
      // 深色主题自带的 #333 底色与页面画布差一截，抹平成同一值（浅色页面本身是白底）。
      // ⚠ 这里的颜色要跟着 _sass/color_schemes/dark-premium.scss 的
      //   $body-background-color 走，两处必须同值，否则图会比页面亮一块。
      background: dark ? "#191c22" : "#ffffff"
    },
    flowchart: { htmlLabels: true, curve: "basis", useMaxWidth: true },
    sequence: { useMaxWidth: true },
    gantt: { useMaxWidth: true }
  };
})()
