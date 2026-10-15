# 当前版本复核矩阵

生成日期：2026-10-14 · 基线：current

| Agent | 当前版本 / 产物 | 固定提交 | 证据方式 |
|---|---|---|---|
| pi | `v1.2.0` | `06a466935536f8c9bcacb2d5efc0fc021be1bdff` | source_readable |
| dsh | `dsh-v0.2.1-alpha.2` | `d743267388641bc76f17c45ce8b4c231aed1d32c` | source_readable |
| codex | `rust-v0.163.0-alpha.11` | `5425d3e625daa58eea3ad1de27c087eb3b2ffbd3` | source_readable |
| claude_code | `v2.1.299 / @anthropic-ai/claude-code@2.1.299` | `发行产物` | release_and_black_box |

| 优先级 | 章节 | 目标 |
|---|---|---|
| P0 | 07, 08, 09, 10, 13, 14, 15 | 事实源、持久化、任务、安全、MCP、长时作业、协议 |
| P1 | 03, 04, 05, 06, 11, 12, 17 | 主循环、工具、压缩、Provider、扩展、诊断 |
| P2 | 01, 02, 16 | 启动、提示词、呈现面 |

> 本文件由 `tools/build_refresh_matrix.rb` 生成；只记录当前基线。
