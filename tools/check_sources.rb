#!/usr/bin/env ruby

require "json"
require "date"

path = ARGV.fetch(0, "sources.lock.json")
data = JSON.parse(File.read(path))
errors = []
expected_projects = %w[pi dsh codex claude_code]

errors << "schema_version must be 2" unless data["schema_version"] == 2
errors << "baseline must be current" unless data["baseline"] == "current"
begin
  Date.iso8601(data.fetch("checked_at"))
rescue KeyError, ArgumentError
  errors << "checked_at must be an ISO date"
end

projects = data["projects"] || {}
errors << "projects must contain #{expected_projects.join(', ')}" unless projects.keys.sort == expected_projects.sort

expected_projects.each do |name|
  project = projects[name] || {}
  %w[repository ref source_kind evidence layers].each do |key|
    errors << "#{name}.#{key} is required" unless project.key?(key)
  end
  layers = project["layers"]
  errors << "#{name}.layers must be an array of layer numbers" unless layers.is_a?(Array) && layers.all? { |layer| layer.is_a?(Integer) && layer.between?(1, 17) }
  if name == "claude_code"
    errors << "claude_code.artifact is required" unless project["artifact"]
  else
    errors << "#{name}.commit is required" unless project["commit"]
  end
end

policy = data["review_policy"] || {}
errors << "review_policy.current_only must be true" unless policy["current_only"] == true
errors << "review_policy.evidence_labels must be present" unless policy["evidence_labels"].is_a?(Array)

priorities = data["layer_priorities"] || {}
priority_layers = priorities.values.flatten
errors << "layer_priorities must cover every layer exactly once" unless priority_layers.sort == (1..17).to_a

if errors.empty?
  puts "sources.lock.json: OK (current baseline #{data['checked_at']})"
else
  warn errors.map { |error| "ERROR: #{error}" }
  exit 1
end
