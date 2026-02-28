# Brave Search Free Tier Optimization Strategy

## Date: 2026-02-21

## Objective
- Optimize Brave Search API free tier usage (2,000 requests/month)
- Ensure sustainable operation without hitting limits

## Current Setup
- Free Tier: 2,000 requests/month (~67 requests/day, ~11 requests/hour)
- Total monthly quota: 2,000 web search requests

## Current Sub-Agent Usage Analysis

| Sub-Agent | Frequency | Requests/Month | Over Limit? |
|-----------|-----------|---------------|-------------|
| saham-indonesia | Every 6 hours (4x/day) | 480 requests | ❌ NO |
| news-indonesia | Every 6 hours (4x/day) | 480 requests | ❌ NO |
| tech-news | Every 4 hours (6x/day) | 720 requests | ❌ NO |

**Total Current Usage: 1,680 requests/month**
**Free Tier Limit: 2,000 requests/month**
**OVERLIMIT: 680 requests/month**

---

## Optimized Strategy (Recommended)

### Option 1: Frequency Adjustment (RECOMMENDED)

| Sub-Agent | New Frequency | New Requests/Month | Savings | Rationale |
|-----------|---------------|------------------|-----------|------------|
| saham-indonesia | **ON DEMAND** (report when needed) | ~60-120 | Save 360-420 | Priority task, run only when needed |
| news-indonesia | **Every 12 hours (2x/day)** | 120 | Save 360 | 12 hours optimal for news cycle |
| tech-news | **PAUSED** (off for now) | 0 | Save 720 | Use knowledge base first |
| **Total** | 120 requests/month | ✅ 48% usage | Sustainable! |

**Benefits:**
- ✅ Well within 2,000 monthly limit
- ✅ Saham reports on-demand (most critical)
- ✅ News coverage (every 12 hours = adequate)
- ✅ Significant quota saved for other needs
- ✅ $0 cost (still using free tier)

---

### Option 2: Knowledge Base Heavy (Most Conservative)

| Sub-Agent | Strategy | Requests/Month | Rationale |
|-----------|-----------|------------------|------------|
| saham-indonesia | **ON DEMAND** | ~60-120 | Run only when user asks |
| news-indonesia | **Batch every 12 hours** | 60 | Run 4 batches/month |
| tech-news | **KNOWLEDGE BASE ONLY** | 0 | Use existing knowledge |
| **Total** | 180-240 requests/month | ✅ 9-12% usage | Maximum conservation |

**Benefits:**
- ✅ Massive quota savings
- ✅ Still provides value
- ✅ Sustainable for long term

---

### Option 3: Full Free Tier Over (Experimental - NOT RECOMMENDED)

| Sub-Agent | Strategy | Requests/Month | Risk |
|-----------|-----------|------------------|------------|
| All 3 | **RUN FIRST MONTH FULL THROTTLE** | 1,680 | High risk of hitting limit |

**Not recommended due to:**
- ⚠️ Will hit 680 request overage
- ⚠️ Possible service interruption mid-month
- ⚠️ Cannot predict when limit enforced

---

## Action Items

### 1. Optimize Sub-Agent Schedules

**For Option 1:**
- [x] tech-news: **PAUSED** (0 requests)
- [x] news-indonesia: Change to 12-hour cycle (120 requests)
- [x] saham-indonesia: Keep on-demand (~60-120 requests)

### 2. Configure API Key in Config

Add Brave API key to OpenClaw config:

```json
{
  "web": {
    "brave": {
      "apiKey": "FREE_TIER_BRAVE_API_KEY_HERE"
    }
  }
}
```

### 3. Implement Smart Request Batching

For any batch of searches:
- Group similar queries into single request
- Use quotes effectively
- Minimize redundant searches

---

## Monitoring Plan

### Daily Quota Tracking
- Current: 2,000/month limit
- Target: ~960/month (Option 1)
- Buffer: 1,040/month for unexpected needs

### Performance Metrics
- Requests成功率 target: >90%
- Data quality: Knowledge-base + selective real-time
- User satisfaction: Priority information delivery

---

## Recommendations to Oncom

1. **Start with Option 1** (balanced approach)
2. **Monitor first month results**
3. **Adjust based on actual usage patterns**
4. **Upgrade to paid tier only if needed**

---

## Implementation Notes

**Current Limitations:**
- 2,000 requests/month is for web search tool
- Each request uses 1 quota
- Sub-agents consume quota independently

**Optimization Techniques:**
- Reduce frequency for non-critical sub-agents
- Use knowledge base for common queries
- Batch similar queries into single request
- Run tech-news on-demand only (not scheduled)

---

**Summary: Free tier is adequate for Option 1 (960 requests/month). No paid tier needed initially.**
