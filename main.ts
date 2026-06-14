import {
	App,
	Plugin,
	PluginSettingTab,
	Setting,
	WorkspaceLeaf,
	ItemView,
	Notice,
	requestUrl,
	moment,
} from "obsidian";

// ============================================
// Types and Interfaces
// ============================================

interface BlogFeed {
	id: string;
	name: string;
	url: string;
	platform: "substack" | "medium" | "ghost" | "other";
	enabled: boolean;
}

interface BlogPost {
	title: string;
	url: string;
	publishedDate: string;
	feedId: string;
	feedName: string;
	platform: string;
}

interface ActivityData {
	[date: string]: BlogPost[];
}

type ColorTheme = "auto" | "light" | "dark";

interface BlogActivitySettings {
	feeds: BlogFeed[];
	activityData: ActivityData;
	lastFetched: string | null;
	defaultView: "weekly" | "monthly" | "yearly";
	colorTheme: ColorTheme;
}

const DEFAULT_SETTINGS: BlogActivitySettings = {
	feeds: [],
	activityData: {},
	lastFetched: null,
	defaultView: "yearly",
	colorTheme: "auto",
};

// ============================================
// View Constants
// ============================================

const VIEW_TYPE_BLOG_ACTIVITY = "blog-activity-view";

// ============================================
// RSS Parser
// ============================================

class RSSParser {
	static async fetchFeed(url: string): Promise<BlogPost[]> {
		try {
			const response = await requestUrl({
				url: url,
				method: "GET",
				headers: {
					"Accept": "application/rss+xml, application/xml, text/xml, application/atom+xml",
				},
			});

			const parser = new DOMParser();
			const doc = parser.parseFromString(response.text, "text/xml");

			// Check for RSS 2.0
			const rssItems = doc.querySelectorAll("item");
			if (rssItems.length > 0) {
				return this.parseRSSItems(rssItems);
			}

			// Check for Atom
			const atomEntries = doc.querySelectorAll("entry");
			if (atomEntries.length > 0) {
				return this.parseAtomEntries(atomEntries);
			}

			return [];
		} catch (error) {
			console.error("Error fetching RSS feed:", error);
			throw error;
		}
	}

	private static parseRSSItems(items: NodeListOf<Element>): BlogPost[] {
		const posts: BlogPost[] = [];

		items.forEach((item) => {
			const title = item.querySelector("title")?.textContent || "Untitled";
			const link = item.querySelector("link")?.textContent || "";
			const pubDate =
				item.querySelector("pubDate")?.textContent ||
				item.querySelector("dc\\:date")?.textContent ||
				"";

			if (pubDate) {
				posts.push({
					title: title,
					url: link,
					publishedDate: moment(pubDate).format("YYYY-MM-DD"),
					feedId: "",
					feedName: "",
					platform: "",
				});
			}
		});

		return posts;
	}

	private static parseAtomEntries(entries: NodeListOf<Element>): BlogPost[] {
		const posts: BlogPost[] = [];

		entries.forEach((entry) => {
			const title = entry.querySelector("title")?.textContent || "Untitled";
			const linkEl = entry.querySelector('link[rel="alternate"]') || entry.querySelector("link");
			const link = linkEl?.getAttribute("href") || "";
			const published =
				entry.querySelector("published")?.textContent ||
				entry.querySelector("updated")?.textContent ||
				"";

			if (published) {
				posts.push({
					title: title,
					url: link,
					publishedDate: moment(published).format("YYYY-MM-DD"),
					feedId: "",
					feedName: "",
					platform: "",
				});
			}
		});

		return posts;
	}
}

// ============================================
// Activity Heatmap View
// ============================================

class BlogActivityView extends ItemView {
	plugin: BlogActivityPlugin;
	currentView: "weekly" | "monthly" | "yearly";

	constructor(leaf: WorkspaceLeaf, plugin: BlogActivityPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.currentView = plugin.settings.defaultView;
	}

	getViewType(): string {
		return VIEW_TYPE_BLOG_ACTIVITY;
	}

	getDisplayText(): string {
		return "Blog Activity";
	}

	getIcon(): string {
		return "calendar-with-checkmark";
	}

	async onOpen(): Promise<void> {
		await this.render();
	}

	async onClose(): Promise<void> {
		// Cleanup
	}

	async render(): Promise<void> {
		const container = this.containerEl.children[1];
		container.empty();
		container.addClass("blog-activity-container");

		// Apply the optional color theme (auto follows Obsidian, light/dark force it)
		container.removeClass(
			"blog-activity-theme-auto",
			"blog-activity-theme-light",
			"blog-activity-theme-dark"
		);
		container.addClass(`blog-activity-theme-${this.plugin.settings.colorTheme}`);

		// Header
		const header = container.createDiv({ cls: "blog-activity-header" });
		header.createEl("h2", { text: "Blog Activity" });

		const headerActions = header.createDiv({ cls: "blog-activity-header-actions" });

		// Light / dark mode toggle (cycles Auto -> Light -> Dark)
		const themeBtn = headerActions.createEl("button", {
			cls: "blog-activity-theme-btn",
		});
		this.updateThemeButton(themeBtn);
		themeBtn.addEventListener("click", async () => {
			const order: ColorTheme[] = ["auto", "light", "dark"];
			const next = order[(order.indexOf(this.plugin.settings.colorTheme) + 1) % order.length];
			this.plugin.settings.colorTheme = next;
			await this.plugin.saveSettings();
			await this.render();
		});

		// Refresh button
		const refreshBtn = headerActions.createEl("button", {
			cls: "blog-activity-refresh-btn",
			text: "Refresh",
		});
		refreshBtn.addEventListener("click", async () => {
			await this.plugin.fetchAllFeeds();
			await this.render();
		});

		// View Toggle
		const toggleContainer = container.createDiv({ cls: "blog-activity-toggle" });
		const views: Array<"weekly" | "monthly" | "yearly"> = ["weekly", "monthly", "yearly"];

		views.forEach((view) => {
			const btn = toggleContainer.createEl("button", {
				cls: `toggle-btn ${this.currentView === view ? "active" : ""}`,
				text: view.charAt(0).toUpperCase() + view.slice(1),
			});
			btn.addEventListener("click", () => {
				this.currentView = view;
				this.render();
			});
		});

		// Stats
		const stats = this.calculateStats();
		const statsContainer = container.createDiv({ cls: "blog-activity-stats" });
		statsContainer.createDiv({ cls: "stat" }).innerHTML = `<span class="stat-value">${stats.totalPosts}</span><span class="stat-label">Total Posts</span>`;
		statsContainer.createDiv({ cls: "stat" }).innerHTML = `<span class="stat-value">${stats.postsInPeriod}</span><span class="stat-label">In Period</span>`;
		statsContainer.createDiv({ cls: "stat" }).innerHTML = `<span class="stat-value">${stats.currentStreak}</span><span class="stat-label">Current Streak</span>`;
		statsContainer.createDiv({ cls: "stat" }).innerHTML = `<span class="stat-value">${stats.longestStreak}</span><span class="stat-label">Longest Streak</span>`;

		// Heatmap
		const heatmapContainer = container.createDiv({ cls: "blog-activity-heatmap-container" });
		this.renderHeatmap(heatmapContainer);

		// Legend
		const legendContainer = container.createDiv({ cls: "blog-activity-legend" });
		legendContainer.createSpan({ text: "Less" });
		for (let i = 0; i <= 4; i++) {
			legendContainer.createDiv({ cls: `legend-cell level-${i}` });
		}
		legendContainer.createSpan({ text: "More" });

		// Recent Posts
		const recentContainer = container.createDiv({ cls: "blog-activity-recent" });
		recentContainer.createEl("h3", { text: "Recent Posts" });
		this.renderRecentPosts(recentContainer);
	}

	private updateThemeButton(btn: HTMLElement): void {
		const labels: Record<ColorTheme, string> = {
			auto: "◑ Auto",
			light: "☀ Light",
			dark: "☾ Dark",
		};
		const theme = this.plugin.settings.colorTheme;
		btn.textContent = labels[theme];
		btn.setAttribute("aria-label", `Color theme: ${theme}. Click to change.`);
		btn.setAttribute("title", `Color theme: ${theme}. Click to change.`);
	}

	private renderHeatmap(container: HTMLElement): void {
		const heatmap = container.createDiv({ cls: "heatmap" });

		const { startDate, endDate, weeks } = this.getDateRange();
		const activityMap = this.getActivityMap(startDate, endDate);

		// Month labels
		const monthLabels = heatmap.createDiv({ cls: "month-labels" });
		monthLabels.createDiv({ cls: "day-label-spacer" }); // Spacer for day labels
		const months = this.getMonthLabels(startDate, endDate);
		months.forEach((month) => {
			const label = monthLabels.createDiv({ cls: "month-label" });
			label.textContent = month.name;
			label.style.gridColumn = `span ${month.weeks}`;
		});

		// Day labels
		const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
		const dayLabelContainer = heatmap.createDiv({ cls: "day-labels" });
		dayLabels.forEach((day, index) => {
			if (index % 2 === 1) {
				dayLabelContainer.createDiv({ cls: "day-label", text: day });
			} else {
				dayLabelContainer.createDiv({ cls: "day-label" });
			}
		});

		// Grid. Use a fixed per-cell column width (via the --cell-size CSS
		// variable) instead of 1fr so the columns never collapse on narrow
		// mobile screens, which previously squashed the cells out of view.
		const grid = heatmap.createDiv({ cls: "heatmap-grid" });
		grid.style.gridTemplateColumns = `repeat(${weeks}, var(--cell-size))`;

		// Create cells for each day
		const current = moment(startDate).startOf("week");
		const end = moment(endDate).endOf("week");

		while (current.isSameOrBefore(end)) {
			const dateStr = current.format("YYYY-MM-DD");
			const posts = activityMap[dateStr] || [];
			const level = this.getActivityLevel(posts.length);

			const cell = grid.createDiv({
				cls: `heatmap-cell level-${level}`,
			});

			if (current.isBefore(startDate) || current.isAfter(endDate)) {
				cell.addClass("outside-range");
			}

			cell.setAttribute("data-date", dateStr);
			cell.setAttribute("data-count", posts.length.toString());

			// Tooltip
			const tooltipText = posts.length === 0
				? `No posts on ${current.format("MMM D, YYYY")}`
				: `${posts.length} post${posts.length > 1 ? "s" : ""} on ${current.format("MMM D, YYYY")}`;

			cell.setAttribute("aria-label", tooltipText);
			cell.setAttribute("title", tooltipText);

			// Click to show posts for that day
			if (posts.length > 0) {
				cell.addEventListener("click", () => {
					this.showDayPosts(dateStr, posts);
				});
				cell.addClass("clickable");
			}

			current.add(1, "day");
		}

		// The most recent weeks sit on the right edge of the graph. On narrow
		// (mobile) screens the graph overflows horizontally, so scroll to the
		// end after layout to make the latest posts visible by default.
		requestAnimationFrame(() => {
			container.scrollLeft = container.scrollWidth;
		});
	}

	private getDateRange(): { startDate: moment.Moment; endDate: moment.Moment; weeks: number } {
		const endDate = moment().endOf("day");
		let startDate: moment.Moment;
		let weeks: number;

		switch (this.currentView) {
			case "weekly":
				startDate = moment().subtract(7, "weeks").startOf("week");
				weeks = 8;
				break;
			case "monthly":
				startDate = moment().subtract(6, "months").startOf("week");
				weeks = Math.ceil(moment().diff(startDate, "weeks")) + 1;
				break;
			case "yearly":
			default:
				startDate = moment().subtract(1, "year").startOf("week");
				weeks = 53;
				break;
		}

		return { startDate, endDate, weeks };
	}

	private getActivityMap(startDate: moment.Moment, endDate: moment.Moment): { [date: string]: BlogPost[] } {
		const activityMap: { [date: string]: BlogPost[] } = {};
		const activityData = this.plugin.settings.activityData;

		Object.entries(activityData).forEach(([date, posts]) => {
			const dateMoment = moment(date);
			if (dateMoment.isBetween(startDate, endDate, "day", "[]")) {
				activityMap[date] = posts;
			}
		});

		return activityMap;
	}

	private getActivityLevel(count: number): number {
		if (count === 0) return 0;
		if (count === 1) return 1;
		if (count === 2) return 2;
		if (count <= 4) return 3;
		return 4;
	}

	private getMonthLabels(startDate: moment.Moment, endDate: moment.Moment): Array<{ name: string; weeks: number }> {
		const months: Array<{ name: string; weeks: number }> = [];
		const current = moment(startDate).startOf("month");

		while (current.isSameOrBefore(endDate)) {
			const monthStart = moment.max(current.clone().startOf("month"), startDate);
			const monthEnd = moment.min(current.clone().endOf("month"), endDate);

			const weeksInMonth = Math.ceil(monthEnd.diff(monthStart, "days") / 7);

			if (weeksInMonth > 0) {
				months.push({
					name: current.format("MMM"),
					weeks: Math.max(1, weeksInMonth),
				});
			}

			current.add(1, "month");
		}

		return months;
	}

	private calculateStats(): { totalPosts: number; postsInPeriod: number; currentStreak: number; longestStreak: number } {
		const activityData = this.plugin.settings.activityData;
		const { startDate, endDate } = this.getDateRange();

		let totalPosts = 0;
		let postsInPeriod = 0;

		Object.entries(activityData).forEach(([date, posts]) => {
			totalPosts += posts.length;
			if (moment(date).isBetween(startDate, endDate, "day", "[]")) {
				postsInPeriod += posts.length;
			}
		});

		// Calculate streaks (weeks with at least one post)
		const { currentStreak, longestStreak } = this.calculateStreaks();

		return { totalPosts, postsInPeriod, currentStreak, longestStreak };
	}

	private calculateStreaks(): { currentStreak: number; longestStreak: number } {
		const activityData = this.plugin.settings.activityData;
		const sortedDates = Object.keys(activityData)
			.filter((date) => activityData[date].length > 0)
			.sort();

		if (sortedDates.length === 0) {
			return { currentStreak: 0, longestStreak: 0 };
		}

		// Group by weeks
		const weekMap: { [week: string]: boolean } = {};
		sortedDates.forEach((date) => {
			const weekKey = moment(date).startOf("week").format("YYYY-WW");
			weekMap[weekKey] = true;
		});

		const weeks = Object.keys(weekMap).sort();
		let longestStreak = 1;
		let currentStreak = 0;
		let tempStreak = 1;

		const currentWeek = moment().startOf("week").format("YYYY-WW");
		const lastWeek = moment().subtract(1, "week").startOf("week").format("YYYY-WW");

		for (let i = 1; i < weeks.length; i++) {
			const prevWeek = moment(weeks[i - 1], "YYYY-WW");
			const currWeek = moment(weeks[i], "YYYY-WW");

			if (currWeek.diff(prevWeek, "weeks") === 1) {
				tempStreak++;
				longestStreak = Math.max(longestStreak, tempStreak);
			} else {
				tempStreak = 1;
			}
		}

		// Check current streak
		if (weeks.includes(currentWeek) || weeks.includes(lastWeek)) {
			currentStreak = tempStreak;
		}

		return { currentStreak, longestStreak };
	}

	private showDayPosts(date: string, posts: BlogPost[]): void {
		const formattedDate = moment(date).format("MMMM D, YYYY");
		new Notice(`Posts on ${formattedDate}:\n${posts.map((p) => `- ${p.title}`).join("\n")}`);
	}

	private renderRecentPosts(container: HTMLElement): void {
		const activityData = this.plugin.settings.activityData;
		const allPosts: BlogPost[] = [];

		Object.values(activityData).forEach((posts) => {
			allPosts.push(...posts);
		});

		allPosts.sort((a, b) => moment(b.publishedDate).diff(moment(a.publishedDate)));

		const recentPosts = allPosts.slice(0, 10);

		if (recentPosts.length === 0) {
			container.createEl("p", {
				text: "No posts yet. Add your blog RSS feeds in settings and click Refresh.",
				cls: "no-posts-message",
			});
			return;
		}

		const list = container.createEl("ul", { cls: "recent-posts-list" });

		recentPosts.forEach((post) => {
			const item = list.createEl("li", { cls: "recent-post-item" });

			const link = item.createEl("a", {
				href: post.url,
				text: post.title,
				cls: "post-title",
			});
			link.setAttr("target", "_blank");

			const meta = item.createDiv({ cls: "post-meta" });
			meta.createSpan({ text: post.feedName, cls: "post-feed" });
			meta.createSpan({ text: " \u2022 " });
			meta.createSpan({
				text: moment(post.publishedDate).format("MMM D, YYYY"),
				cls: "post-date",
			});
		});
	}
}

// ============================================
// Settings Tab
// ============================================

class BlogActivitySettingTab extends PluginSettingTab {
	plugin: BlogActivityPlugin;

	constructor(app: App, plugin: BlogActivityPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Blog Activity Tracker Settings" });

		// Default view setting
		new Setting(containerEl)
			.setName("Default view")
			.setDesc("Choose the default time range for the activity view")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("weekly", "Weekly (8 weeks)")
					.addOption("monthly", "Monthly (6 months)")
					.addOption("yearly", "Yearly (52 weeks)")
					.setValue(this.plugin.settings.defaultView)
					.onChange(async (value) => {
						this.plugin.settings.defaultView = value as "weekly" | "monthly" | "yearly";
						await this.plugin.saveSettings();
					})
			);

		// Color theme setting (optional light mode)
		new Setting(containerEl)
			.setName("Color theme")
			.setDesc(
				"Choose how the activity view is colored. Auto follows your Obsidian theme; Light and Dark force that appearance regardless of your theme."
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption("auto", "Auto (match Obsidian)")
					.addOption("light", "Light")
					.addOption("dark", "Dark")
					.setValue(this.plugin.settings.colorTheme)
					.onChange(async (value) => {
						this.plugin.settings.colorTheme = value as ColorTheme;
						await this.plugin.saveSettings();
						this.plugin.refreshOpenViews();
					})
			);

		// RSS Feeds section
		containerEl.createEl("h3", { text: "RSS Feeds" });

		containerEl.createEl("p", {
			text: "Add your blog RSS feeds below. Common feed URLs:",
			cls: "setting-item-description",
		});

		const feedHelp = containerEl.createEl("ul", { cls: "feed-help" });
		feedHelp.createEl("li", { text: "Substack: https://yourname.substack.com/feed" });
		feedHelp.createEl("li", { text: "Medium: https://medium.com/feed/@yourname" });
		feedHelp.createEl("li", { text: "Ghost: https://yourblog.com/rss/" });

		// Add feed button
		new Setting(containerEl)
			.setName("Add new feed")
			.setDesc("Add a new RSS feed to track")
			.addButton((button) =>
				button.setButtonText("Add Feed").onClick(() => {
					this.plugin.settings.feeds.push({
						id: Date.now().toString(),
						name: "New Blog",
						url: "",
						platform: "other",
						enabled: true,
					});
					this.plugin.saveSettings();
					this.display();
				})
			);

		// List existing feeds
		this.plugin.settings.feeds.forEach((feed, index) => {
			const feedContainer = containerEl.createDiv({ cls: "feed-setting-container" });

			new Setting(feedContainer)
				.setName(`Feed ${index + 1}: ${feed.name}`)
				.setDesc(feed.url || "No URL set")
				.addToggle((toggle) =>
					toggle.setValue(feed.enabled).onChange(async (value) => {
						feed.enabled = value;
						await this.plugin.saveSettings();
					})
				)
				.addButton((button) =>
					button
						.setButtonText("Edit")
						.onClick(() => {
							this.showFeedEditor(feed, index);
						})
				)
				.addButton((button) =>
					button
						.setButtonText("Delete")
						.setWarning()
						.onClick(async () => {
							this.plugin.settings.feeds.splice(index, 1);
							await this.plugin.saveSettings();
							this.display();
						})
				);
		});

		// Manual fetch button
		containerEl.createEl("h3", { text: "Data Management" });

		new Setting(containerEl)
			.setName("Fetch all feeds")
			.setDesc("Manually fetch all enabled RSS feeds")
			.addButton((button) =>
				button.setButtonText("Fetch Now").onClick(async () => {
					await this.plugin.fetchAllFeeds();
					new Notice("Feeds fetched successfully!");
				})
			);

		new Setting(containerEl)
			.setName("Clear activity data")
			.setDesc("Remove all stored activity data")
			.addButton((button) =>
				button
					.setButtonText("Clear Data")
					.setWarning()
					.onClick(async () => {
						this.plugin.settings.activityData = {};
						this.plugin.settings.lastFetched = null;
						await this.plugin.saveSettings();
						new Notice("Activity data cleared!");
					})
			);

		// Last fetched info
		if (this.plugin.settings.lastFetched) {
			containerEl.createEl("p", {
				text: `Last fetched: ${moment(this.plugin.settings.lastFetched).format("MMMM D, YYYY h:mm A")}`,
				cls: "setting-item-description",
			});
		}
	}

	private showFeedEditor(feed: BlogFeed, index: number): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Edit Feed" });

		new Setting(containerEl)
			.setName("Feed name")
			.setDesc("A friendly name for this feed")
			.addText((text) =>
				text.setValue(feed.name).onChange(async (value) => {
					feed.name = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Feed URL")
			.setDesc("The RSS feed URL")
			.addText((text) =>
				text
					.setPlaceholder("https://example.com/feed")
					.setValue(feed.url)
					.onChange(async (value) => {
						feed.url = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Platform")
			.setDesc("The blog platform (for display purposes)")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("substack", "Substack")
					.addOption("medium", "Medium")
					.addOption("ghost", "Ghost")
					.addOption("other", "Other")
					.setValue(feed.platform)
					.onChange(async (value) => {
						feed.platform = value as BlogFeed["platform"];
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Test feed")
			.setDesc("Test if the feed URL is valid and working")
			.addButton((button) =>
				button.setButtonText("Test").onClick(async () => {
					try {
						const posts = await RSSParser.fetchFeed(feed.url);
						new Notice(`Success! Found ${posts.length} posts.`);
					} catch (error) {
						new Notice(`Error: Could not fetch feed. Check the URL.`);
					}
				})
			);

		new Setting(containerEl).addButton((button) =>
			button.setButtonText("Back to Settings").onClick(() => {
				this.display();
			})
		);
	}
}

// ============================================
// Main Plugin
// ============================================

export default class BlogActivityPlugin extends Plugin {
	settings: BlogActivitySettings;

	async onload(): Promise<void> {
		await this.loadSettings();

		// Register view
		this.registerView(VIEW_TYPE_BLOG_ACTIVITY, (leaf) => new BlogActivityView(leaf, this));

		// Add ribbon icon
		this.addRibbonIcon("calendar-with-checkmark", "Blog Activity", () => {
			this.activateView();
		});

		// Add command to open view
		this.addCommand({
			id: "open-blog-activity",
			name: "Open Blog Activity View",
			callback: () => {
				this.activateView();
			},
		});

		// Add command to refresh feeds
		this.addCommand({
			id: "refresh-blog-feeds",
			name: "Refresh Blog Feeds",
			callback: async () => {
				await this.fetchAllFeeds();
				new Notice("Blog feeds refreshed!");
			},
		});

		// Add settings tab
		this.addSettingTab(new BlogActivitySettingTab(this.app, this));

		// Auto-fetch on startup if last fetch was more than 1 hour ago
		if (
			!this.settings.lastFetched ||
			moment().diff(moment(this.settings.lastFetched), "hours") >= 1
		) {
			// Delay to avoid slowing down Obsidian startup
			setTimeout(() => {
				this.fetchAllFeeds();
			}, 5000);
		}
	}

	async onunload(): Promise<void> {
		// Cleanup
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	async activateView(): Promise<void> {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_BLOG_ACTIVITY);

		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			leaf = workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({ type: VIEW_TYPE_BLOG_ACTIVITY, active: true });
			}
		}

		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}

	async fetchAllFeeds(): Promise<void> {
		const enabledFeeds = this.settings.feeds.filter((f) => f.enabled && f.url);

		if (enabledFeeds.length === 0) {
			return;
		}

		for (const feed of enabledFeeds) {
			try {
				const posts = await RSSParser.fetchFeed(feed.url);

				// Add feed info to posts and store them
				posts.forEach((post) => {
					post.feedId = feed.id;
					post.feedName = feed.name;
					post.platform = feed.platform;

					// Store by date
					const date = post.publishedDate;
					if (!this.settings.activityData[date]) {
						this.settings.activityData[date] = [];
					}

					// Avoid duplicates
					const exists = this.settings.activityData[date].some(
						(p) => p.url === post.url || (p.title === post.title && p.feedId === post.feedId)
					);

					if (!exists) {
						this.settings.activityData[date].push(post);
					}
				});
			} catch (error) {
				console.error(`Error fetching feed ${feed.name}:`, error);
				new Notice(`Failed to fetch ${feed.name}`);
			}
		}

		this.settings.lastFetched = moment().toISOString();
		await this.saveSettings();

		// Refresh view if open
		await this.refreshOpenViews();
	}

	async refreshOpenViews(): Promise<void> {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_BLOG_ACTIVITY);
		for (const leaf of leaves) {
			const view = leaf.view as BlogActivityView;
			if (view && view.render) {
				await view.render();
			}
		}
	}
}
