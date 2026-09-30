---
type: literature
created: 2026-07-12
tags: [agent, blog]
aliases: [Building effective agents]
---
# Lit - Building Effective Agents

**Source**: Erik Schluntz & Barry Zhang, "Building effective agents", Anthropic engineering blog, December 2024

## Workflows vs. agents
The post separates systems where the LLM follows a code path fixed in advance (workflows) from systems where the LLM decides its own steps and tool calls (agents). The advice is to start with the simplest thing — often a single well-prompted call with retrieval — and only add autonomy when it clearly pays off, since agents trade latency and cost for flexibility.

## Workflow patterns described
- Prompt chaining: fixed sequence of calls, each consuming the previous output.
- Routing: classify the input, then send it to a specialized path.
- Parallelization: split into independent subtasks, or run the same task several times and vote.
- Orchestrator–workers: a central model breaks down the task and delegates.
- Evaluator–optimizer: one call generates, another critiques, in a loop.

## Agents
An agent is a model using tools in a loop, grounded by feedback from the environment at each step, with stopping conditions. The authors stress keeping it simple and transparent (show the planning steps).

## Tool design ("agent-computer interface")
The part most relevant to me: the effort that goes into designing interfaces for humans should also go into tool definitions for models. Concrete suggestions include clear descriptions with examples and edge cases, argument formats that are natural for the model, and testing how the model actually uses a tool and then changing the tool so mistakes become harder to make.

## Derived notes
- [[Agent loop 的质量取决于工具设计]]
