#!/usr/bin/env ruby

require "json"

root = File.expand_path("..", __dir__)
lock = JSON.parse(File.read(File.join(root, "sources.lock.json")))
priorities = lock.fetch("layer_priorities")

lines = []
lines << "# 当前版本复核矩阵"
lines << ""
lines << "生成日期：#{lock.fetch('checked_at')} · 基线：#{lock.fetch('baseline')}"
lines << ""
lines << "| Agent | 当前版本 / 产物 | 固定提交 | 证据方式 |"
lines << "|---|---|---|---|"
lock.fetch("projects").each do |name, project|
  version = project["ref"]
  version = "#{version} / #{project['artifact']}" if project["artifact"]
  commit = project["commit"] || "发行产物"
  lines << "| #{name} | `#{version}` | `#{commit}` | #{project.fetch('evidence')} |"
end
lines << ""
lines << "| 优先级 | 章节 | 目标 |"
lines << "|---|---|---|"
lines << "| P0 | #{priorities.fetch('P0').map { |n| format('%02d', n) }.join(', ')} | 事实源、持久化、任务、安全、MCP、长时作业、协议 |"
lines << "| P1 | #{priorities.fetch('P1').map { |n| format('%02d', n) }.join(', ')} | 主循环、工具、压缩、Provider、扩展、诊断 |"
lines << "| P2 | #{priorities.fetch('P2').map { |n| format('%02d', n) }.join(', ')} | 启动、提示词、呈现面 |"
lines << ""
lines << "> 本文件由 `tools/build_refresh_matrix.rb` 生成；只记录当前基线。"

output = ARGV[ARGV.index("--output") + 1] if ARGV.include?("--output")
if output
  target = File.expand_path(output, root)
  File.write(target, lines.join("\n") + "\n")
  puts "wrote #{target}"
else
  puts lines.join("\n")
end
