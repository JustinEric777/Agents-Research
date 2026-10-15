#!/usr/bin/env ruby

require "json"

ROOT = File.expand_path("..", __dir__)
LOCK = JSON.parse(File.read(File.join(ROOT, "sources.lock.json")))
errors = []
chapter_files = Dir[File.join(ROOT, "*.md")].select { |file| File.basename(file) =~ /\A(?:0[1-9]|1[0-8])-.*\.md\z/ }

required_metadata = {
  "reviewed_at" => /\Areviewed_at:\s*\d{4}-\d{2}-\d{2}\s*\z/,
  "baseline" => /\Abaseline:\s*current\s*\z/,
  "evidence_mode" => /\Aevidence_mode:\s*\S+\s*\z/,
  "review_priority" => /\Areview_priority:\s*P[012]\s*\z/
}

chapter_files.each do |file|
  lines = File.readlines(file, chomp: true)
  front_matter = lines.take(20)
  required_metadata.each do |key, pattern|
    errors << "#{File.basename(file)} is missing current metadata #{key}" unless front_matter.any? { |line| line.match?(pattern) }
  end
end

%w[README.md 00-总览与导航.md 18-版本更新与结构复核.md].each do |name|
  content = File.read(File.join(ROOT, name))
  %w[原始分析版本 历史快照 historical_analysis_baseline 旧版本维护].each do |forbidden|
    errors << "#{name} contains removed historical-maintenance wording: #{forbidden}" if content.include?(forbidden)
  end
end

errors << "sources.lock.json must be current-only" unless LOCK["baseline"] == "current" && LOCK.dig("review_policy", "current_only") == true

if errors.empty?
  citation_count = chapter_files.sum { |file| File.read(file).scan(/\[[^\]]+\]|`[^`]+:\d+(?:-\d+)?`/).length }
  puts "citation metadata: OK (#{chapter_files.length} chapters, #{citation_count} evidence markers)"
else
  warn errors.map { |error| "ERROR: #{error}" }
  exit 1
end
