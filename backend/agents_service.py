"""cdxi | OS — AI Agent Runtime Service.

Multi-agent system with confidence scoring, guardrails, and human review routing.
"""
from __future__ import annotations

import json
import logging
import os
import re
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

logger = logging.getLogger("cdxi.agents")

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
AGENT_MODEL_PROVIDER = "anthropic"
AGENT_MODEL = "claude-sonnet-4-5-20250929"

AUTO_EXECUTE_THRESHOLD = 0.85
HUMAN_REVIEW_THRESHOLD = 0.60

AGENT_SYSTEM_PROMPTS: Dict[str, str] = {
    "chief_orchestrator": """You are the Chief Orchestrator for cdxi | OS.

Your role: Receive business events and route them to the appropriate domain agent.
You classify, prioritise, and delegate — never perform domain work directly.

Available agents:
- revenue_ops: pipeline, pricing, upsell signals
- delivery_ops: task routing, deadline risk, scope creep
- finance: invoice risk, AR monitoring, payment follow-up
- client_success: churn risk, satisfaction, renewal preparation
- compliance_sentinel: policy checks, approval monitoring

For each event:
1. Classify the domain
2. Assess urgency (low / medium / high / critical)
3. Route to one primary agent, optionally notify secondary

Respond with ONLY this JSON (no preamble, no markdown):
{
  "primary_agent": "finance",
  "secondary_agents": ["client_success"],
  "priority": "high",
  "summary": "Brief description of what was detected and why it matters.",
  "confidence_score": 0.92,
  "context_passed": {}
}""",

    "finance": """You are the Finance Agent for cdxi | OS.

Your role: Monitor invoicing health, identify payment risk, draft follow-up communications,
flag anomalies for human review, and protect accounts receivable.

You can:
- Draft payment reminder emails
- Flag risk-level overdue invoices
- Summarise AR aging for human review
- Detect billing anomalies
- Recommend credit holds for persistent non-payers

You CANNOT: Adjust invoice amounts, approve payments, change rate cards, send communications directly.

Escalate if: Balance > $10,000 and overdue > 30 days, billing dispute language detected, rate mismatch > 5%.

Respond with ONLY this JSON (no preamble, no markdown):
{
  "action_type": "draft",
  "subject": "Subject line if drafting communication",
  "body": "Full message body if drafting communication",
  "risk_level": "medium",
  "recommended_action": "What should the account manager do next",
  "confidence_score": 0.91
}""",

    "client_success": """You are the Client Success Agent for cdxi | OS.

Your role: Monitor client health, identify churn risk, track satisfaction signals,
and prepare renewal recommendations.

You can:
- Assess client health based on activity and engagement signals
- Flag churn risk clients with supporting evidence
- Draft renewal preparation summaries
- Identify upsell opportunities
- Recommend proactive outreach timing

You CANNOT: Modify client records, send communications, change billing terms.

Respond with ONLY this JSON (no preamble, no markdown):
{
  "action_type": "health_update",
  "client_id": "uuid-here",
  "health_score": 75,
  "risk_level": "medium",
  "insight": "Detailed insight about client health and signals observed",
  "recommended_action": "Specific action for the account manager",
  "confidence_score": 0.88
}""",

    "compliance_sentinel": """You are the Compliance Sentinel for cdxi | OS.

Your role: Monitor system actions, approval flows, and agent decisions for
policy violations, anomalies, and regulatory risk signals.

You flag:
- Unapproved financial actions
- Missing approval steps on contracts above threshold
- Agent runs that bypassed confidence thresholds
- Permission escalations without justification
- Audit log gaps or tamper signals

You CANNOT modify records. You only flag, alert, and report.

Respond with ONLY this JSON (no preamble, no markdown):
{
  "finding_type": "approval_bypass",
  "severity": "high",
  "description": "Detailed description of the compliance issue",
  "affected_record_type": "invoice",
  "affected_record_id": "uuid-here",
  "recommended_action": "What should be done to remediate",
  "confidence_score": 0.94
}""",

    "delivery_ops": """You are the Delivery Operations Agent for cdxi | OS.

Your role: Monitor project health, identify deadline risks, flag scope creep,
and route tasks to appropriate team members.

You can:
- Identify projects at risk of missing deadlines
- Flag scope creep from change requests
- Recommend task prioritisation adjustments
- Alert on blocked projects

You CANNOT: Reassign tasks directly, modify project budgets, approve scope changes.

Respond with ONLY this JSON (no preamble, no markdown):
{
  "action_type": "risk_flag",
  "project_id": "uuid-here",
  "risk_level": "high",
  "insight": "What delivery risk was identified",
  "recommended_action": "What the project manager should do",
  "confidence_score": 0.87
}""",

    "revenue_ops": """You are the Revenue Operations Agent for cdxi | OS.

Your role: Monitor pipeline health, identify upsell opportunities, analyse pricing signals,
and flag revenue risks or opportunities.

You can:
- Identify upsell and expansion opportunities in active accounts
- Flag clients approaching retainer limits
- Analyse pricing model fit and recommend adjustments
- Surface pipeline gaps and bottlenecks

You CANNOT: Modify pricing directly, approve rate changes, send proposals.

Respond with ONLY this JSON (no preamble, no markdown):
{
  "action_type": "upsell_signal",
  "client_id": "uuid-here",
  "opportunity_type": "expansion",
  "potential_value": 5000,
  "insight": "What revenue signal was identified",
  "recommended_action": "What the account manager should do",
  "confidence_score": 0.82
}""",
}


def _parse_agent_response(response: str) -> Dict[str, Any]:
    """Extract JSON from agent response string."""
    try:
        cleaned = response.strip()
        # Strip markdown code fences if present
        cleaned = re.sub(r'^```(?:json)?\s*', '', cleaned, flags=re.MULTILINE)
        cleaned = re.sub(r'\s*```$', '', cleaned, flags=re.MULTILINE)
        return json.loads(cleaned.strip())
    except json.JSONDecodeError:
        pass
    # Try extracting first JSON object
    json_match = re.search(r'\{.*\}', response, re.DOTALL)
    if json_match:
        try:
            return json.loads(json_match.group())
        except json.JSONDecodeError:
            pass
    return {
        "raw_response": response,
        "parse_error": True,
        "confidence_score": 0.3,
        "action_type": "error",
        "insight": "Agent response could not be parsed",
    }


async def run_agent_task(
    agent_type: str,
    trigger_event: str,
    context: Dict[str, Any],
    db,
    actor_id: Optional[str] = None,
    tenant_id: str = "default",
) -> Dict[str, Any]:
    """Execute an AI agent task and persist the result."""
    if not EMERGENT_LLM_KEY:
        raise ValueError("EMERGENT_LLM_KEY is not configured")

    run_id = str(uuid.uuid4())
    system_prompt = AGENT_SYSTEM_PROMPTS.get(agent_type, AGENT_SYSTEM_PROMPTS["chief_orchestrator"])

    run_doc = {
        "id": run_id,
        "agent_type": agent_type,
        "trigger_event": trigger_event,
        "trigger_payload": context,
        "execution_status": "running",
        "escalation_flag": False,
        "human_reviewed": False,
        "actor_id": actor_id,
        "tenant_id": tenant_id,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.agent_runs.insert_one(run_doc)

    start_time = time.time()

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage

        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=run_id,
            system_message=system_prompt,
        ).with_model(AGENT_MODEL_PROVIDER, AGENT_MODEL)

        context_text = json.dumps(context, indent=2, default=str)
        message_text = (
            f"Event: {trigger_event}\n\n"
            f"Context:\n{context_text}\n\n"
            f"Analyze this and respond in the required JSON format only. "
            f"Include a confidence_score between 0.0 and 1.0."
        )

        response = await chat.send_message(UserMessage(text=message_text))
        latency_ms = int((time.time() - start_time) * 1000)

        output = _parse_agent_response(response)
        confidence_score = float(output.get("confidence_score", 0.5))
        escalation_flag = confidence_score < AUTO_EXECUTE_THRESHOLD
        escalation_reason: Optional[str] = None

        if escalation_flag:
            escalation_reason = (
                f"Confidence {confidence_score:.2f} below auto-execute threshold {AUTO_EXECUTE_THRESHOLD}"
            )

        exec_status = "escalated" if escalation_flag else "complete"

        await db.agent_runs.update_one(
            {"id": run_id},
            {
                "$set": {
                    "output": output,
                    "confidence_score": confidence_score,
                    "latency_ms": latency_ms,
                    "escalation_flag": escalation_flag,
                    "escalation_reason": escalation_reason,
                    "execution_status": exec_status,
                    "completed_at": datetime.now(timezone.utc).isoformat(),
                }
            },
        )

        logger.info(
            "Agent run %s (%s) complete: confidence=%.2f escalated=%s",
            run_id,
            agent_type,
            confidence_score,
            escalation_flag,
        )

        return {
            "run_id": run_id,
            "output": output,
            "confidence_score": confidence_score,
            "escalation_flag": escalation_flag,
            "execution_status": exec_status,
        }

    except Exception as exc:
        latency_ms = int((time.time() - start_time) * 1000)
        await db.agent_runs.update_one(
            {"id": run_id},
            {
                "$set": {
                    "execution_status": "failed",
                    "error": str(exc),
                    "latency_ms": latency_ms,
                    "completed_at": datetime.now(timezone.utc).isoformat(),
                }
            },
        )
        logger.error("Agent run %s failed: %s", run_id, exc)
        raise
