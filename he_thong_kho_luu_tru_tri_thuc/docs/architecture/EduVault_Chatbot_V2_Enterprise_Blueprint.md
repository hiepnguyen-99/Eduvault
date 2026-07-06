# EduVault Chatbot V2 Enterprise Blueprint

> Version: 2.0  
> Status: Execution-ready architecture blueprint  
> Scope: Upgrade the current EduVault v4 chatbot without regressing existing strengths

## 1. Executive Summary

The current EduVault chatbot is already a strong internal RAG assistant. It has:

- LangGraph orchestration
- Hybrid retrieval
- RBAC-aware document filtering
- Action and system routing
- Audit and feedback
- Memory
- Qdrant with database fallback

That means V2 should not be a rewrite. It should be an upgrade that preserves what is already working and adds better planning, streaming, observability, maintainability, and answer reliability.

The target is to move from this:

```text
Question
-> Intent
-> Retrieval
-> LLM
-> Answer
```

To this:

```text
Goal Understanding
-> Planning
-> Routed Multi-Agent Execution
-> Retrieval / Tools / Actions
-> Reflection
-> Verification
-> Memory Update
-> Real Streaming Response
```

## 2. Assessment: Will This Plan Improve the Chatbot?

Yes, this plan can improve the chatbot a lot, but only if we implement it in the right order.

The current draft is strong in ambition, but it mixes:

- immediate engineering needs
- medium-term architecture upgrades
- long-term enterprise capabilities

If we implement everything at once, we create a real risk of making the chatbot slower, more complex, and harder to debug.

So the answer is:

- The plan is directionally correct.
- It will improve the chatbot if we sequence it carefully.
- The first priorities should be maintainability, memory cleanup, real streaming, observability, and safer modularization.
- Planner, reflection, tool registry, and knowledge graph should come after the foundation is stable.

## 3. Non-Regression Principles

V2 must be better than V1 in behavior, not just in architecture slides.

We do not accept an upgrade that weakens:

- citation quality
- permission safety
- fallback behavior
- latency
- debuggability
- document access controls
- existing action/system routes

Definition of non-regression:

1. Existing RAG routes still return grounded answers with citations.
2. Private documents never leak through planner/tool/reflection layers.
3. Qdrant failure still degrades gracefully to database retrieval.
4. Existing `action_answer` and `system_answer` behavior keeps working.
5. The chatbot stays explainable through traces, audit logs, and metrics.

## 4. Current State vs Target State

### Current strengths

- LangGraph router already exists
- The chatbot already separates:
  - `rag`
  - `system`
  - `action`
  - `conversational`
  - `out_of_scope`
- Retrieval already supports:
  - query rewrite
  - expansion
  - hybrid lexical/vector scoring
  - rerank
  - citation output
- Feedback and audit are already present
- Retrieval refactor has begun with `src/eduvault/rag_pipeline.py`

### Current weaknesses

- Streaming is simulated, not real model streaming
- Memory is duplicated between frontend and backend
- `services.py` still carries too much responsibility
- Reflection is missing
- Planner is missing
- Tool selection is still mostly static
- Observability is too shallow for enterprise tuning
- Architecture is still partly linear even though LangGraph is already present

## 5. Target Architecture

```text
User
 |
Frontend Assistant UI
 |
Chat API
 |
Conversation Manager
 |
LangGraph Orchestrator
 |
Planner Agent
 |
+---------------------------+
| Retrieval Agent           |
| Action Agent              |
| System Agent              |
| Safety Agent              |
| Memory Manager            |
| Tool Registry             |
+---------------------------+
 |
Reflection Agent
 |
Citation Validator
 |
AI Gateway
 |
Real Streaming Response
```

### Important design note

Not every query should go through every component.

Good V2 behavior is selective:

- simple RAG query: router -> retrieval -> answer -> verification
- system question: router -> system agent
- operational question: router -> action agent
- multi-goal request: router -> planner -> subtask execution
- weak-confidence answer: reflection -> retry or downgrade response

This keeps latency under control.

## 6. Recommended Upgrade Order

This is the most important change to the blueprint.

### Phase 1: Stabilize the foundation

Goals:

- reduce architectural risk
- improve maintainability
- preserve current answer quality

Work:

- continue refactoring `services.py`
- unify memory ownership on backend
- implement real streaming
- add telemetry per LangGraph node
- add retrieval and response caching
- formalize answer trace schema

Expected outcome:

- lower latency
- easier debugging
- safer future upgrades

### Phase 2: Retrieval quality upgrades

Goals:

- improve grounding
- reduce hallucination
- keep citations reliable

Work:

- adaptive TopK
- better multi-query generation
- retrieval retry strategy
- confidence scoring
- citation scoring
- retrieval observability dashboard

Expected outcome:

- higher grounding quality
- better retrieval consistency

### Phase 3: Planner Agent

Goals:

- handle multi-step user goals, not just search queries

Example:

```text
Prepare teaching materials for AI
-> find syllabus
-> find lecture slides
-> find lab documents
-> find exams
-> merge answer
```

Important restriction:

The planner should only activate for complex, multi-goal requests. It should not slow down normal search.

### Phase 4: Reflection and verification

Goals:

- detect weak answers before final delivery
- retry only when confidence is low

Pipeline:

```text
Answer
-> check citations
-> check confidence
-> check answer-document alignment
-> retry retrieval if needed
-> respond
```

Important restriction:

Reflection must be bounded. Unlimited retries will hurt latency and cost.

### Phase 5: Tool Registry and dynamic tool calling

Goals:

- replace large intent-specific branching with a structured tool system

Core tools:

- search tool
- policy tool
- repository tool
- analytics tool
- download tool
- operations tool

Important restriction:

Tool execution must remain permission-aware. Tool calling without RBAC enforcement would be a regression.

### Phase 6: AI Gateway

Goals:

- route models by task type, latency, and cost

Candidate providers:

- GPT
- Claude
- Gemini
- Qwen
- DeepSeek
- Ollama

Important restriction:

Do not add multi-provider routing before traces, evaluation, and fallback policies are mature.

### Phase 7: Knowledge Graph

Goals:

- support richer planning and reasoning over institutional relationships

Entities:

- Faculty
- Lecturer
- Course
- Subject
- Topic
- Document
- Folder
- Policy

Relationships:

- teaches
- belongs_to
- prerequisite
- owns
- references

Important restriction:

Knowledge Graph is valuable, but it should not be phase 1. It is a force multiplier, not the first fix.

## 7. What Should Be Improved Immediately

These are the upgrades with the best impact-to-risk ratio.

### 7.1 Real streaming

Current issue:

- backend computes the full answer first
- then emits word-by-word fake NDJSON streaming

Upgrade:

- run retrieval first
- start LLM token streaming immediately after retrieval context is ready
- stream true deltas to the frontend

Why it improves the chatbot:

- users see useful output sooner
- latency feels lower even when total compute stays similar
- UX becomes meaningfully better

### 7.2 Backend-owned memory

Current issue:

- frontend injects local memory into the prompt
- backend also injects server memory

Upgrade:

- frontend stores only UI history
- backend owns working memory, episodic memory, and memory selection
- frontend sends conversation ID or plain user message only

Why it improves the chatbot:

- avoids duplicate context
- improves prompt consistency
- makes memory behavior testable

### 7.3 Finish modularizing RAG

Current issue:

- retrieval/rerank runtime has started moving to `rag_pipeline.py`
- answer composition still lives in `services.py`

Upgrade:

- split into:
  - `rag/retrieval.py`
  - `rag/rerank.py`
  - `rag/answering.py`
  - `rag/verification.py`
  - `rag/trace.py`

Why it improves the chatbot:

- easier iteration on retrieval quality
- easier to test each stage
- lower blast radius for future planner/reflection changes

### 7.4 Telemetry and evaluation

Current issue:

- current traces are useful, but not enough for enterprise tuning

Upgrade:

- capture:
  - node latency
  - retrieval provider used
  - top-k and rerank counts
  - confidence
  - citation precision
  - retry counts
  - token and cost

Why it improves the chatbot:

- we can tune with evidence instead of intuition
- easier to detect regressions

## 8. Planner Agent Design

The planner should not be a vague “smart step.”

It should have a strict contract.

### Planner input

- user question
- user role
- page context
- optional conversation memory summary

### Planner output

```json
{
  "goal": "prepare teaching materials for AI",
  "complexity": "multi_step",
  "subtasks": [
    {"type": "retrieval", "query": "AI syllabus"},
    {"type": "retrieval", "query": "AI lecture slides"},
    {"type": "retrieval", "query": "AI lab documents"},
    {"type": "retrieval", "query": "AI exams"}
  ],
  "merge_strategy": "group_by_document_type"
}
```

### Planner activation rule

Only activate when:

- multiple explicit goals are present
- the user asks for preparation, comparison, synthesis, audit, or packaging
- one-shot retrieval is clearly insufficient

Do not activate planner for:

- simple fact lookup
- system help
- a single document search

## 9. Reflection Agent Design

Reflection should not rewrite everything. It should verify whether the answer is trustworthy enough to ship.

### Reflection checks

- are citations present when required?
- does answer content align with cited documents?
- is confidence high enough?
- is there evidence of retrieval mismatch?
- is the answer overclaiming?

### Reflection outputs

- `accept`
- `accept_with_warning`
- `retry_retrieval`
- `downgrade_to_insufficient_evidence`

### Rule

Reflection should be deterministic where possible. It should not become another unbounded LLM layer.

## 10. Tool Registry Design

The registry should define:

- tool name
- required permission
- input schema
- output schema
- execution handler
- observability hooks

Example:

```text
Tool: download_document
Permission: document.download
Input: {document_id}
Output: {asset_id, filename, mime_type}
```

This is better than expanding `if/elif` intent logic forever.

## 11. AI Gateway Design

The AI Gateway should decide:

- which provider to use
- which model tier to use
- whether to route to local or external inference
- when to retry on provider failure

Routing dimensions:

- latency
- cost
- confidence requirement
- task type
- streaming support

Example strategy:

- cheap rewrite/query expansion: small fast model
- final grounded answer: higher-quality model
- OCR fallback or offline mode: local model if possible

## 12. Observability Requirements

Enterprise chatbot work lives or dies on observability.

We should track:

- total latency
- retrieval latency
- planner latency
- reflection latency
- tokens
- cost
- retrieval provider
- fallback frequency
- confidence distribution
- feedback distribution
- citation precision
- insufficient evidence rate

Dashboards should show:

- last hour
- last 24 hours
- per route
- per model
- per provider

## 13. Security Requirements

V2 must preserve and strengthen security.

Required controls:

- RBAC at retrieval time
- RBAC at tool execution time
- prompt injection resistance
- secret redaction
- audit for all privileged actions
- human approval for high-risk actions
- model output constraints for restricted data

Critical rule:

Planner and tool calling must never become a bypass around document permissions.

## 14. Testing Strategy

### Unit tests

- planner output structure
- retrieval scoring
- rerank filtering
- reflection decision logic
- memory selection logic
- tool registry validation

### Integration tests

- multi-agent route execution
- planner -> retrieval -> merge flow
- reflection retry path
- tool permission enforcement
- streaming correctness

### Regression suite

- 1000+ prompts across:
  - search
  - system help
  - action
  - multi-step planning
  - restricted document cases
  - weak evidence cases

### Mandatory evaluation metrics

- answer accuracy
- citation precision
- citation recall
- hallucination rate
- intent accuracy
- planner success rate
- reflection retry precision
- latency
- cost

## 15. Definition of Done

The upgrade is complete only if all of the following are true:

- planner works for multi-goal queries
- reflection works and is bounded
- streaming is real
- hallucination rate is below agreed threshold
- citation quality is measurably improved
- latency is not materially worse for simple queries
- permission safety is preserved
- tests pass
- observability is available in practice
- the system is easier to maintain than V1, not harder

## 16. Final Judgment

This blueprint absolutely can improve the chatbot.

The strongest parts of the plan are:

- planner for multi-goal work
- reflection for reliability
- backend-owned memory
- real streaming
- observability
- modular RAG

The riskiest parts are:

- adding too many enterprise layers too early
- introducing planner/tool/reflection before the foundation is stabilized
- overusing LLM-driven routing where deterministic rules are enough

So the right conclusion is:

- yes, this roadmap improves the chatbot
- but the order matters more than the feature list
- the first win is not “more agents”
- the first win is “cleaner, safer, faster foundations”

## 17. Recommended Next Build Order

If we are implementing this for real, the next engineering sequence should be:

1. Finish RAG modularization.
2. Move memory ownership fully to backend.
3. Implement real streaming.
4. Add node-level telemetry and evaluation hooks.
5. Add bounded reflection.
6. Add planner only for complex queries.
7. Add tool registry.
8. Add AI Gateway.
9. Add Knowledge Graph when the rest is stable.

That sequence improves the chatbot without turning a good system into a fragile one.
