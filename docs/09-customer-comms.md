# Customer Communication Guide — Fanout SEO

> How to explain what we're building to non-technical stakeholders, clients, and early adopters. Designed for the developer/SEO to use when talking to business owners, marketing directors, or agency clients.

---

## The 30-Second Pitch (Non-Technical)

> "Google now answers many searches with an AI summary at the top of the page — before any links. Our tool tells you which websites Google is pulling that summary from, at what position, and across thousands of searches at once. Then it tells you exactly which paragraph on those websites Google is quoting. So instead of guessing why someone else is getting cited by Google's AI, you can read the exact sentence that's earning them that placement."

---

## Explaining Core Concepts Without Jargon

### AI Overview (AIO)

**Don't say:** "AI Overview citations extracted from the SERP via DataForSEO API"

**Do say:** "When you Google something and a box appears at the top with an AI-written answer — that's an AI Overview. Google puts a list of websites it used to build that answer, like footnotes in a research paper. We track which websites show up in those footnotes, for which searches, and at what position."

---

### Fan-Out

**Don't say:** "Recursive PAA/AIO follow-up keyword extraction with deduplication"

**Do say:** "You give us 100 keywords. We ask Google's AI about all 100, but then we also notice what follow-up questions Google suggests for each one. We ask about those too. And their follow-ups. It's like pulling a thread — one keyword can uncover 500 closely related ones automatically. You control how deep we go."

---

### Position 1–10 Analysis

**Don't say:** "Weighted visibility score aggregation with root/subdomain domain mode toggle"

**Do say:** "When Google's AI cites a website in its answer, it lists them in order — position 1 is the most prominently featured, position 10 is the last. We count up: across all your target topics, which websites appear most often at position 1? Position 2? And so on. It's like a league table for Google's AI. NerdWallet might be at position 1 for 40% of credit card searches. That's information your competitors don't have."

---

### Topic Clustering

**Don't say:** "Jaccard similarity-based clustering on shared domain sets and PAA question overlap"

**Do say:** "Once we've gathered all the data, we automatically group your keywords into themes — like 'credit card rewards' and 'travel cards' and 'business cards.' For each theme, we show you which websites Google's AI trusts most. This tells you where you're strong and where you're invisible."

---

### Crawler + Snippet Matching

**Don't say:** "TF-IDF + Jaccard similarity matching between AIO snippet text and extracted page_sections"

**Do say:** "We visit each website Google is citing and look at their content. Then we match Google's AI summary text back to the specific paragraph or heading on that page that Google pulled from. So instead of just knowing 'Google cites NerdWallet,' you know 'Google cites the second paragraph under their H2 heading Our Top Picks.' That's the exact content you need to replicate or improve upon."

---

## Explaining the Technology Stack

### Why a Desktop App?

> "We built this as a desktop application — software you install on your computer — rather than a website you log into. There are three reasons:
> 1. Your data stays on your machine. No one else sees your keyword lists or strategy.
> 2. Each project is a single file you can share, back up, or open on another computer — like a spreadsheet.
> 3. It's faster. Analyzing 10,000 keywords locally is much quicker than sending everything to a server and waiting."

### Why DataForSEO?

> "We use DataForSEO as our data provider. They have a direct connection to Google search results — the actual AI Overviews, not approximations. It costs a small amount per search query (roughly $0.003), so a run of 5,000 keywords costs around $15–45 depending on the depth. You pay DataForSEO directly for the data; our tool is what makes sense of it."

### Why Is Data Not Real-Time?

> "This is a batch research tool, not a live monitoring system. You run a project, it harvests data over an hour or two, and then you analyze that snapshot. Think of it like a quarterly audit rather than a daily dashboard. We're working on scheduled re-runs for the next version — so you can set it up to re-check every month automatically."

---

## Client-Facing Email Templates

### Introducing the Tool (Agency → Client)

```
Subject: New: AI Search Visibility Analysis

Hi [Client Name],

As you've probably noticed, Google is increasingly showing AI-generated
summaries at the top of search results — often before any clickable links.
These are called AI Overviews, and they're becoming a significant source
of brand visibility (and traffic).

We've invested in a new tool that lets us track exactly which websites
Google's AI is citing for your key topics, and at what prominence (position
1 through 10).

For your industry, we can now answer:
• Which competitors does Google trust most in its AI answers?
• For which topics is your website being cited — or invisible?
• What specific content on competitor sites is Google quoting?

I'd like to run your first AI Visibility Audit this week. It covers your
[X] target keywords and will give us a clear picture of where you stand.

Would you like me to proceed?

[Your name]
```

### Delivering Results (Agency → Client)

```
Subject: Your AI Visibility Report is Ready

Hi [Client Name],

Your AI Overview analysis is complete. Here's the headline summary:

• We analyzed [X] keywords across [Y] topic clusters
• Google AI cites your website in [Z]% of relevant searches
• Your strongest topic: [Topic] ([X] citations)
• Your biggest gap: [Topic] — [Competitor] dominates at position 1 for [X]% of queries

The attached report shows:
1. Position 1–10 breakdown: which domains Google trusts most, by topic
2. Content mapping: the specific page sections competitors are getting cited for
3. Opportunity list: the [X] queries where you have organic traffic but zero AI presence

Our recommendation: [2-3 bullet action items]

Happy to walk through this on a call — let me know what time works.

[Your name]
```

---

## Handling Common Questions

### "Is this legal?"

> "We're using DataForSEO's official API to query publicly visible Google search results — the same thing any person can see when they search Google. We don't scrape Google directly. This is standard practice in the SEO industry and is compliant with DataForSEO's terms of service."

### "Why can't we just look at this ourselves in Google?"

> "You could look at one keyword at a time manually, but our typical client is targeting 5,000+ keywords. At one keyword per minute, that's 80+ hours of manual checking — every time you want updated data. We do it in 1–2 hours, automatically, and store the results so you can slice them in any direction."

### "How often should we run this?"

> "Google's AI Overviews change frequently — new websites get cited, others drop out. For competitive niches, monthly re-runs give you a trend picture. For most businesses, quarterly is sufficient. We'll set up automatic re-runs so you don't have to think about it."

### "How accurate is the data?"

> "DataForSEO pulls live data from Google at the time of the query. The AI Overview you'd see if you Googled that term right now. One caveat: Google personalizes results slightly by location and device, so we always query for the same location (US desktop, or wherever your audience is) to keep comparisons consistent."

### "Can we see our competitors' data too?"

> "Yes — that's actually one of the most valuable parts. We track all domains that appear in AI Overviews for your target keywords, not just yours. So you can see exactly what your top 10 competitors are doing to earn those citations. That tells you what content strategy is working right now."

---

## Keeping Clients Informed During Development

### Progress Update Template

```
Week [N] Update — Fanout Development

What we completed:
• [Feature 1] — [plain English description]
• [Feature 2] — [plain English description]

What we're working on next:
• [Feature] — expected by [date]

What you can expect to see in your next report:
• [New capability, plain English]

No action needed from you — just keeping you in the loop.
```

### When Something Takes Longer Than Expected

> "We hit a technical challenge with [X feature] that's adding about [N] weeks to the timeline. The impact on you: [plain English description of what's delayed]. We're not cutting any features — just moving this one to the next release. Everything you already have access to continues to work as expected."

---

*← [Crawler Research](./08-crawler-research.md) | Next: [Skills & Tools](./10-skills-tools.md) →*
