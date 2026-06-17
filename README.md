# Blog Activity Tracker

**Build a better publishing habit — right inside Obsidian.**

Writing consistently is hard. The hard part isn't any single post; it's
showing up week after week. Blog Activity Tracker turns your publishing
history into a GitHub-style heatmap so you can *see* your habit, protect
your streaks, and keep the words flowing.

Point it at your Substack, Medium, or Ghost feed and watch your consistency
take shape.

## Why you'll write more

- **See your habit at a glance.** A contribution-style heatmap makes every
  published post a filled-in square. Empty weeks stand out — so you fill them.
- **Don't break the chain.** Current-streak and longest-streak counters give
  you a number worth protecting. Momentum becomes its own motivation.
- **Turn output into accountability.** Total posts and posts-in-period stats
  keep you honest about how much you're actually shipping.
- **One home for every platform.** Track Substack, Medium, Ghost, and any
  other RSS feed together, so your whole publishing habit lives in one view.
- **Stays where you think.** It all happens inside Obsidian, next to the notes
  and drafts where your writing already starts.

## How it works

1. Open the **Blog Activity** view from the ribbon icon or command palette.
2. Add your blog's RSS feed in settings:
   - **Substack:** `https://yourname.substack.com/feed`
   - **Medium:** `https://medium.com/feed/@yourname`
   - **Ghost:** `https://yourblog.com/rss/`
3. Hit **Refresh** and watch your publishing history fill in.

Feeds refresh automatically on startup (when the last fetch was over an hour
ago), or any time you click **Refresh**.

## Features

- GitHub-style activity heatmap with weekly, monthly, and yearly views
- Current and longest publishing streaks
- Total and in-period post counts
- Recent posts list with links back to each piece
- Light / dark / auto color themes
- Works on desktop and mobile

## Installation

1. Copy `main.js`, `manifest.json`, and `styles.css` into your vault at
   `.obsidian/plugins/blog-activity-tracker/`.
2. Reload Obsidian and enable **Blog Activity Tracker** in
   *Settings → Community plugins*.

## Development

```bash
npm install
npm run dev    # watch + rebuild
npm run build  # type-check + production build
```

## License

MIT
