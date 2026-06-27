# Plexi — Baby Boomer council, and the fixes shipped from it

A four-persona Boomer council reviewed the suite: a late-career owner/executive, a non-technical professional who must use it daily, a privacy-and-cost skeptic, and a community-group/nonprofit organizer. The persona files live in `.claude/agents/` (boomer-voice base + boomer-exec, boomer-professional, boomer-skeptic). Unlike the younger panels, this council gates almost entirely on accessibility, plain clarity, trust, and "is there help" — the things that decide whether someone who did not grow up with software will actually use it.

A useful finding up front: several of the council's loudest complaints were already resolved before they reviewed, because they read the older gap-analysis doc. Two-factor and SSO are now real (shipped in 2.5.90 and 2.5.94), the schedulers now run in the background (2.5.90), and office file-format export now keeps formatting (2.5.93). So those are not open issues; the council validated that they were the right things to fix.

## What the council agreed works

The apps underneath are real and behave like grown-up software, the consolidation-into-one-tool story appeals to people tired of juggling logins, the security plumbing (proper password hashing, the encrypted vault, payments through a real processor) reads as careful rather than slapdash, and the local-first design (your work stays on your machine) is exactly the reassurance a privacy-minded Boomer wants. The four-step first-run was praised as respectful of their time.

## The open issues the council surfaced, and what was done

Three issues were both genuinely open and fixable in the app, and all three are now fixed.

The professional's number-one problem was that the text is too small and too low-contrast, with no app-wide way to make it bigger; the only zoom control scaled the canvas, not the menus and lists. Fixed: a **Text size** control in Appearance (Small / Default / Large / Larger / Largest) that drives Chromium's page zoom, the same thing the browser's Ctrl-plus does, so every menu, list, label and button scales together. The choice is remembered and re-applied before the app paints on the next launch.

The skeptic's number-one problem, echoed by the exec and the professional, was an honesty gap: the sign-in screen promised "no telemetry, no tracking," but the app sent aggregate usage data anyway and the opt-out did nothing, a switch on the wall that did not turn off the light. Fixed: the opt-out is now real. A **Share anonymous usage data** toggle in Settings under Privacy genuinely stops the reporting when turned off (checked before every send), and the sign-in copy now tells the truth, no third-party trackers or ads, anonymous aggregate usage that helps improve the app and that you can turn off. Words now match behaviour.

The exec and the nonprofit organizer both said there was nowhere to get help, no visible support and no idea of the price. Fixed within honesty limits: a **Help & support** section in Settings links to the guides and to plans & pricing (both previously had no in-app entry), with a plain note on what stays on your device, what leaves it, and that AI features only send the text you ask them to act on. There is no fabricated phone line; what exists (the guides) is now findable.

## What the council raised that is not an in-app fix

The largest remaining Boomer objections are the same structural ones every panel has named, and they are deliberately not patched here because doing so blindly would be worse than honest: there is no mobile or web client (so the nonprofit's phone-only volunteers and the exec's answer-from-the-car habit are unmet, this is the web/mobile program), the workspace does not yet follow you across devices by default (the multi-device-sync client is built and ships, but the durable multi-instance backend it ideally rides is the Postgres/Redis program), there is no human support line, and there is no published nonprofit price. Those are product, infrastructure, and business decisions, not code changes to make at the end of a session.

## Net

The council's fixable accessibility and trust issues, readable text at any size, a telemetry switch that tells the truth and works, and findable help, are shipped and tested. The structural objections (mobile/web reach, a support line, nonprofit pricing, the durable backend) are real and remain on the roadmap as the larger programs they genuinely are.
