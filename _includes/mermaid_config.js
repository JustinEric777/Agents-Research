{%- comment -%}
  mermaid 的初始化配置。本文件被主题的 components/mermaid.html 以
  `var config = {% include mermaid_config.js %};` 内联进页面，所以必须是
  一个**表达式**——这里用 IIFE 返回对象，好在里面读一次当前配色。
{%- endcomment -%}
(function () {
  // mermaid 只在初始化时读颜色，之后颜色就写死在生成的 SVG 里了，所以切换
  // 主题时含图的页面会刷新一次（见 _includes/header_custom.html）。
  var dark = document.documentElement.getAttribute("data-theme") === "dark";

  // 图的配色必须跟着站点走：整站是石墨灰阶，图若还带彩色，一张图就能把整页的
  // 调子带偏。因此**不用** mermaid 内置的 `dark` / `neutral`——两者各自带蓝绿
  // 底子、覆盖不干净——改用 `base` 主题并自己填一整套灰阶变量。
  // ⚠ 这里的每个颜色都与 _sass/color_schemes/dark-premium.scss（深色）/
  //   主题 light.scss（浅色）同源，改一处必须改另一处，否则图与页面两个底色。
  var c = dark
    ? {
        bg: "#0b0c0e",           // $body-background-color（画布）
        node: "#14171c",         // $code-background-color（面板一档）
        nodeAlt: "#101114",      // $sidebar-color
        border: "#2c3138",       // 节点描边（比 $border-color 亮一档，图上才看得出）
        line: "#5a626c",         // 连线 / 信号线
        text: "#c2c8d1",         // $body-text-color
        textStrong: "#eff1f5",   // $body-heading-color
        label: "#0f1114",        // 边标签底（须不透明，否则压不住穿过的连线）
        cluster: "#0e1013",      // 子图底
        clusterBorder: "#23262c" // $border-color
      }
    : {
        bg: "#ffffff",
        node: "#f5f6fa",
        nodeAlt: "#f7f7f9",
        border: "#c9ccd3",
        line: "#8f959d",
        text: "#27262b",
        textStrong: "#1b1b1f",
        label: "#ffffff",
        cluster: "#fafafb",
        clusterBorder: "#d9dce1"
      };

  return {
    startOnLoad: false,
    theme: "base",
    securityLevel: "loose",
    fontFamily: '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif',
    themeVariables: {
      darkMode: dark,
      background: c.bg,
      fontSize: "14px",

      // 节点 / 盒子
      primaryColor: c.node,
      primaryTextColor: c.text,
      primaryBorderColor: c.border,
      secondaryColor: c.nodeAlt,
      secondaryTextColor: c.text,
      secondaryBorderColor: c.border,
      tertiaryColor: c.cluster,
      tertiaryTextColor: c.text,
      tertiaryBorderColor: c.border,
      mainBkg: c.node,
      nodeBorder: c.border,
      nodeTextColor: c.text,

      // 连线与文字
      lineColor: c.line,
      textColor: c.text,
      titleColor: c.textStrong,
      edgeLabelBackground: c.label,

      // 子图（subgraph）
      clusterBkg: c.cluster,
      clusterBorder: c.clusterBorder,

      // 时序图（本站 20 张图里含 sequenceDiagram）——不显式给值会落到内置浅色默认
      actorBkg: c.node,
      actorBorder: c.border,
      actorTextColor: c.text,
      actorLineColor: c.line,
      signalColor: c.text,
      signalTextColor: c.text,
      labelBoxBkgColor: c.node,
      labelBoxBorderColor: c.border,
      labelTextColor: c.text,
      loopTextColor: c.text,
      noteBkgColor: c.nodeAlt,
      noteBorderColor: c.border,
      noteTextColor: c.text,
      activationBkgColor: c.nodeAlt,
      activationBorderColor: c.border,
      sequenceNumberColor: c.textStrong
    },
    flowchart: { htmlLabels: true, curve: "basis", useMaxWidth: true },
    sequence: { useMaxWidth: true },
    gantt: { useMaxWidth: true }
  };
})()
