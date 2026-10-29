/* ebook-vault 静态站点前端。
 *
 * 纯原生 JavaScript，零依赖、零构建。
 * 通过 http(s) 打开时，页面先 fetch data/home.json（推荐书）和 data/categories.json（分类名与册数），
 * 两者就绪后立刻绘制推荐书。
 * 首页绘制成功后，按分类册数从小到大，逐个加载 data/books/<分类>.json。
 * 每次只请求一个，完成后再请求下一个，并写入内存分片缓存。
 * 首页网格先只显示推荐书。已载入的其他书排在推荐书后面，点「加载更多」才出现。
 * 搜索只查已经在内存里的书（推荐书，加上已经载入的分类分片）。
 * 同一次搜索还在进行时，后面的分片到达会更新命中。
 * 后台分片失败只记日志，继续下一个分类，不进入整页加载失败。
 * 选中分类时如果该分片还没缓存，再取这一个分片。
 * 用 file:// 打开时浏览器会拦截 fetch，这时改为加载同路径的 .js，
 * 由脚本写入 window.EBOOK_HOME、EBOOK_CATEGORIES 和 EBOOK_SHARDS。
 *
 * 分片沿用长字段：title/title_zh/author/category/link/ext/size/size_text/
 * subcategory/tags/status/password/filename/uploaded_at/language，另加 id。
 * 页面内部仍用短字段：t zh l a c s e z f k u pw p。
 * l / language 是书本身的语言（ZH 中文 / EN 英文 / OTHER 其他），不是界面语言。
 * 搜索按空白切成多个词，每个词都要出现在书名、中文译名、作者或分类里。
 */
(function () {
  "use strict";

  var PAGE_SIZE = 60;
  var DEBOUNCE_MS = 120;
  var LANG_KEY = "ebook-vault-lang";
  var currentLang = "zh-CN";

  var STRINGS = {
    en: {
      docTitle: "Ebook Vault",
      metaDescription: "Personal ebook library with real-time multi-keyword search; download links are hosted on Ctfile.",
      brand: "Ebook Vault",
      skip: "Skip to books",
      searchPlaceholder: "Search title, author, or topic, e.g. Pride and Prejudice",
      searchAria: "Search title, author, category, tags, or filename",
      rootLink: "📥 Download full library",
      filtersAria: "Filters",
      filtersTitle: "Filters",
      filtersOpen: "Filter",
      filtersDone: "Done",
      clearFilters: "Clear all",
      folderTitle: "Collections",
      folderHint: "Ctfile folders",
      categoryTitle: "Categories",
      multiHint: "Multi-select",
      onlyDownloadable: "Downloadable only",
      contentAria: "Books",
      countLead: "",
      countMid: " books / ",
      countTail: " shown",
      sortLabel: "Sort",
      sortAria: "Sort by",
      sortRecommended: "Recommended",
      sortRelevance: "Relevance",
      sortTitle: "Title",
      sortSize: "Size",
      loading: "Loading the library…",
      emptyTitle: "No matching ebooks",
      emptyHint: "Try a shorter query, or clear the filters.",
      emptyReset: "Clear search and filters",
      emptyLibraryTitle: "The library is empty",
      emptyLibraryHint: "Run python3 -m ebook_vault scan, then export the site.",
      loadErrorTitle: "Couldn't load the library",
      loadErrorHint: "",
      loadMore: "Load more",
      loadMoreLeft: "Load more ({n} left)",
      footerLine: "Ebook Vault · {count} books",
      footerNotice: "Copyright: this library is a personal collection drawn from public-domain and openly licensed sources. Rights remain with the authors and rights holders; contact us to request removal. Download links are for personal study and bandwidth testing only. Delete them within 24 hours and do not use them commercially. Please support official editions.",
      toTop: "Back to top",
      langAria: "Language",
      themeToDark: "Switch to dark mode",
      themeToLight: "Switch to light mode",
      folderLinkTitle: "Open the “{name}” folder and download every book in this category",
      folderBadge: "📥 All",
      ariaDownload: "Open download: ",
      ariaCollection: "Open collection: ",
      untitled: "Untitled",
      unknownAuthor: "Unknown",
      pending: "Pending",
      download: "Download",
      downloadCollection: "Bundle",
      copyLink: "Copy link",
      copied: "✅ Copied",
      linkCopied: "✅ Download link copied",
      linkCopiedCode: "✅ Download link copied (code included)",
      copyFailed: "❌ Couldn’t copy. Open the link manually.",
      codeCopiedBtn: "✅ Code copied",
      codeBtn: "🔑 Code {code}",
      codeCopiedToast: "✅ Code {code} copied",
      codeCopyFailed: "❌ Couldn’t copy. Enter the code manually.",
      codeTitle: "Code: {code}",
      collectionTitle: "Open this category’s shared folder",
      badgeCollection: "Collection",
      langZh: "Chinese",
      langEn: "English",
      langOther: "Other"
    },
    "zh-CN": {
      docTitle: "书海拾贝 · 电子书宝库",
      metaDescription: "个人电子书宝库，支持实时多关键词搜索，下载链接托管于城通网盘。",
      brand: "书海拾贝 · 电子书宝库",
      skip: "跳到书籍列表",
      searchPlaceholder: "搜索书名、作者或分类，例如「傲慢与偏见」",
      searchAria: "搜索书名、作者、分类、标签、文件名",
      rootLink: "📥 整库合集下载",
      filtersAria: "筛选条件",
      filtersTitle: "筛选",
      filtersOpen: "筛选",
      filtersDone: "完成",
      clearFilters: "清空全部",
      folderTitle: "合集下载",
      folderHint: "城通文件夹",
      categoryTitle: "分类",
      multiHint: "可多选",
      onlyDownloadable: "仅显示可下载",
      contentAria: "书籍列表",
      countLead: "共 ",
      countMid: " 本 / 已筛选 ",
      countTail: " 本",
      sortLabel: "排序",
      sortAria: "排序方式",
      sortRecommended: "推荐",
      sortRelevance: "相关度",
      sortTitle: "书名",
      sortSize: "大小",
      loading: "正在加载书籍数据…",
      emptyTitle: "没有找到匹配的电子书",
      emptyHint: "试试更短的关键词，或清空筛选条件。",
      emptyReset: "清空搜索与筛选",
      emptyLibraryTitle: "书库中还没有电子书",
      emptyLibraryHint: "先运行 python3 -m ebook_vault scan 扫描书库，再 export 生成站点。",
      loadErrorTitle: "书籍数据加载失败",
      loadErrorHint: "",
      loadMore: "加载更多",
      loadMoreLeft: "加载更多（还有 {n} 本）",
      footerLine: "书海拾贝 · 电子书宝库 · 共 {count} 本",
      footerNotice: "版权声明：本站内容来自个人整理与公版/开放授权来源，版权归著作人及版权方所有；如侵犯您的权益请联系删除。下载链接仅供个人学习与宽带测试研究，请于下载后 24 小时内删除，请勿用于商业目的。请支持正版！",
      toTop: "回到顶部",
      langAria: "语言",
      themeToDark: "切换到深色模式",
      themeToLight: "切换到浅色模式",
      folderLinkTitle: "打开「{name}」分类文件夹，批量下载该分类所有电子书",
      folderBadge: "📥 合集",
      ariaDownload: "打开城通网盘下载：",
      ariaCollection: "打开分类合集下载：",
      untitled: "未命名",
      unknownAuthor: "佚名",
      pending: "待上传",
      download: "📥 下载",
      downloadCollection: "📥 下载合集",
      copyLink: "📋 复制链接",
      copied: "✅ 已复制",
      linkCopied: "✅ 下载链接已复制",
      linkCopiedCode: "✅ 下载链接已复制（链接内已含提取码）",
      copyFailed: "❌ 复制失败，请手动打开链接",
      codeCopiedBtn: "✅ 已复制提取码",
      codeBtn: "🔑 提取码 {code}",
      codeCopiedToast: "✅ 提取码 {code} 已复制",
      codeCopyFailed: "❌ 复制失败，请手动输入提取码",
      codeTitle: "提取码：{code}",
      collectionTitle: "打开所属分类的城通文件夹分享链接",
      badgeCollection: "分类合集",
      langZh: "中文",
      langEn: "英文",
      langOther: "其他"
    }
  };

  var CATEGORY_LABELS = {
    "编程开发": "Programming",
    "统计与数据科学": "Statistics",
    "教材教辅": "Textbooks",
    "历史与社会": "History & Society",
    "人文社科": "Humanities",
    "中国古典文学": "Chinese Classics",
    "中国现当代文学": "Modern Chinese Literature",
    "世界文学": "World Literature",
    "世界文学·小说": "World Fiction",
    "世界文学·诗歌": "World Poetry",
    "世界文学·戏剧": "World Drama",
    "世界文学·散文": "World Essays",
    "世界文学·儿童": "World Children's",
    "世界文学·传记": "World Biography",
    "世界文学·历史": "World History",
    "世界文学·科普": "World Popular Science",
    "世界文学·人文": "World Humanities",
    "诗歌散文": "Poetry & Essays",
    "文学阅读": "Literature",
    "悬疑推理": "Mystery & Crime",
    "科幻奇幻": "Sci-Fi & Fantasy",
    "经济管理": "Business & Economics",
    "心理励志": "Psychology & Self-Help",
    "科技科普": "Science & Technology",
    "传记纪实": "Biography & Memoir",
    "艺术生活": "Arts & Lifestyle",
    "生活健康": "Health & Living",
    "少儿教育": "Children & Education",
    "综合百科": "Reference",
    "诺贝尔奖": "Nobel Prize",
    "精选论文": "Selected Papers",
    "在线教程文档": "Online Docs",
    "出版合集": "Collections",
    "未分类": "Uncategorized"
  };

  // 子分类存在库里的原值不改，筛选仍按原值匹配。
  // 简体中文：只把英文原值（Books、Chemistry 等）换成中文，中文原值保持中文。
  // 英文界面：中文原值换成英文标签，英文原值保持原值。
  var SUBCATEGORY_LABELS = {
    "Books": "著作",
    "Chemistry": "化学",
    "Physics": "物理",
    "Medicine": "医学",
    "Economics": "经济学",
    "Literature": "文学",
    "Peace": "和平"
  };

  function t(key) {
    var pack = STRINGS[currentLang] || STRINGS.en;
    if (pack && Object.prototype.hasOwnProperty.call(pack, key)) return pack[key];
    return STRINGS.en[key] || key;
  }

  function categoryLabel(key) {
    if (currentLang === "zh-CN") return key;
    return CATEGORY_LABELS[key] || key;
  }

  // 英文界面上仍会显示的中文标签。键是库里的原值。
  var SUBCATEGORY_EN = {
    "公版经典": "Public-domain classic",
    "中国历史": "Chinese History",
    "诸子": "Masters",
    "小学": "Primary School",
    "国学": "Chinese Learning",
    "诗词": "Shi and Ci",
    "初中": "Junior High",
    "高中": "Senior High",
    "易学": "Yijing Studies",
    "其他": "Other",
    "艺术": "Art",
    "AI与机器学习": "AI & Machine Learning",
    "漫画": "Comics",
    "五·四学制": "5–4 School System",
    "外国文学": "Foreign Literature",
    "人邮PDF": "PTPress PDFs",
    "职场": "Workplace",
    "二战": "World War II",
    "营销": "Marketing",
    "大学教材": "College Textbooks",
    "Web开发": "Web Development",
    "理财": "Personal Finance",
    "学习": "Learning",
    "股票": "Stocks",
    "爱情": "Love",
    "中国近现代史": "Modern Chinese History",
    "医学": "Medicine",
    "欧洲": "Europe",
    "心理学": "Psychology",
    "人物": "People",
    "沟通": "Communication",
    "女性": "Women",
    "后端": "Backend",
    "诗歌": "Poetry",
    "自我成长": "Personal Growth",
    "物理": "Physics",
    "科技": "Technology",
    "数据分析": "Data Analysis",
    "当代": "Contemporary",
    "世界历史": "World History",
    "外国": "Foreign",
    "大数据": "Big Data",
    "交易": "Trading",
    "犯罪": "Crime",
    "古典": "Classical",
    "健康": "Health",
    "经济学": "Economics",
    "思想": "Thought",
    "数学": "Mathematics",
    "侦探": "Detective",
    "自然": "Nature",
    "数据库": "Databases",
    "治愈": "Comfort",
    "近代史": "Early Modern History",
    "人工智能": "Artificial Intelligence",
    "晚清": "Late Qing",
    "野史": "Unofficial History",
    "游记": "Travelogues",
    "民国": "Republican China",
    "人类": "Humankind",
    "写作": "Writing",
    "安全": "Security",
    "企业": "Companies",
    "宇宙": "The Universe",
    "青春": "Youth",
    "人生": "Life",
    "美食": "Cuisine",
    "言情": "Romance Fiction",
    "操作系统与Linux": "Operating Systems & Linux",
    "武侠": "Wuxia",
    "心灵": "Mind & Spirit",
    "生物": "Life Sciences",
    "动物": "Animals",
    "罗马": "Rome",
    "三国": "Three Kingdoms",
    "JavaScript与前端": "JavaScript & Frontend",
    "博物馆": "Museums",
    "明朝": "Ming Dynasty",
    "育儿": "Child Rearing",
    "宗教": "Religion",
    "恐怖": "Horror",
    "天文": "Astronomy",
    "C与C++": "C & C++",
    "情绪": "Emotions",
    "现代": "Modern",
    "玄幻": "Xuanhuan",
    "数学习题": "Math Exercises",
    "算法与数据结构": "Algorithms & Data Structures",
    "货币": "Money",
    "清史": "Qing History",
    "网络与协议": "Networks & Protocols",
    "编程": "Programming",
    "绘画": "Painting",
    "魔幻": "Magical Fantasy",
    "设计模式与代码质量": "Design Patterns & Code Quality",
    "世界史": "World History",
    "大学": "College",
    "惊悚": "Thriller",
    "口才": "Speaking",
    "巴菲特": "Buffett",
    "电影": "Film",
    "法医": "Forensics",
    "广告": "Advertising",
    "回忆录": "Memoirs",
    "健身": "Fitness",
    "成功": "Success",
    "方法": "Methods",
    "古希腊": "Ancient Greece",
    "鸡汤": "Inspirational",
    "经管": "Business Management",
    "明史": "Ming History",
    "情商": "Emotional Intelligence",
    "摄影": "Photography",
    "生命": "Life Science",
    "意大利": "Italy",
    "佛学": "Buddhist Studies",
    "间谍": "Espionage",
    "社会学人类学": "Sociology & Anthropology",
    "苏联": "Soviet Union",
    "文明": "Civilization",
    "印度": "India",
    "中世纪": "Middle Ages",
    "古代": "Ancient",
    "决策": "Decision Making",
    "领导力": "Leadership",
    "欧洲史": "European History",
    "社交": "Social Skills",
    "思考": "Thinking",
    "地理": "Geography",
    "工作": "Work",
    "基因": "Genes",
    "人格": "Personality",
    "神话": "Mythology",
    "唐朝": "Tang Dynasty",
    "以色列": "Israel",
    "云计算与DevOps": "Cloud & DevOps",
    "财富": "Wealth",
    "操作系统": "Operating Systems",
    "城市": "Cities",
    "绘本": "Picture Books",
    "基金": "Funds",
    "技术": "Technical",
    "家庭": "Family",
    "灵异": "Supernatural",
    "旅行": "Travel",
    "清朝": "Qing Dynasty",
    "情感": "Feelings",
    "认知": "Cognition",
    "探险，艺术": "Exploration & Art",
    "植物": "Plants",
    "保健": "Health Care",
    "博弈": "Strategy",
    "谍战": "Spy Fiction",
    "官场": "Officialdom",
    "汉朝": "Han Dynasty",
    "红楼梦": "Dream of the Red Chamber",
    "华为": "Huawei",
    "建筑": "Architecture",
    "焦虑": "Anxiety",
    "人性": "Human Nature",
    "生活实用": "Practical Living",
    "数据": "Data",
    "文案": "Copywriting",
    "战国": "Warring States",
    "中国文学": "Chinese Literature",
    "并行计算": "Parallel Computing",
    "海洋": "Oceans",
    "记忆": "Memory",
    "进化": "Evolution",
    "经营": "Management",
    "科普": "Popular Science",
    "冷战": "Cold War",
    "两性": "Men & Women",
    "秦汉": "Qin & Han",
    "社会学": "Sociology",
    "思想史": "Intellectual History",
    "唐诗": "Tang Poetry",
    "未来": "The Future",
    "文革": "Cultural Revolution",
    "希腊": "Greece",
    "音乐": "Music",
    "自传": "Autobiography",
    "Swift与iOS": "Swift & iOS",
    "定位": "Positioning",
    "读书": "Books & Reading",
    "古罗马": "Ancient Rome",
    "故宫": "Forbidden City",
    "抗战": "War of Resistance",
    "考古": "Archaeology",
    "零售": "Retail",
    "猫": "Cats",
    "区块链": "Blockchain",
    "诗集": "Poetry Collections",
    "文物": "Cultural Relics",
    "西班牙": "Spain",
    "习惯": "Habits",
    "先秦": "Pre-Qin",
    "销售": "Sales",
    "新经济": "New Economy",
    "新媒体": "New Media",
    "性格": "Character",
    "语言": "Language",
    "阿拉伯": "Arabia",
    "北洋": "Beiyang",
    "财经": "Finance",
    "财务": "Corporate Finance",
    "大脑": "The Brain",
    "读客": "Duoke",
    "短篇": "Short Stories",
    "古籍": "Ancient Books",
    "海盗": "Pirates",
    "环境": "Environment",
    "会计": "Accounting",
    "婚姻": "Marriage",
    "领导": "Leaders",
    "贸易": "Trade",
    "脑科学": "Neuroscience",
    "品牌": "Brands",
    "亲子": "Parent & Child",
    "史学": "Historiography",
    "宋词": "Song Ci",
    "宋史": "Song History",
    "太平天国": "Taiping Rebellion",
    "魏晋": "Wei & Jin",
    "刑侦": "Criminal Investigation",
    "亚洲": "Asia",
    "演讲": "Public Speaking",
    "饮食": "Diet",
    "中医": "Chinese Medicine",
    "资本": "Capital",
    "Docker与容器": "Docker & Containers",
    "Go语言": "Go",
    "保险": "Insurance",
    "盗墓": "Tomb Raiding",
    "法律": "Law",
    "房地产": "Real Estate",
    "非洲": "Africa",
    "佛教": "Buddhism",
    "改革": "Reform",
    "谷歌": "Google",
    "股市": "Stock Market",
    "硅谷": "Silicon Valley",
    "架构与微服务": "Architecture & Microservices",
    "近代": "Early Modern",
    "咖啡": "Coffee",
    "拉美": "Latin America",
    "伦理": "Ethics",
    "莎士比亚": "Shakespeare",
    "宋朝": "Song Dynasty",
    "太空": "Space",
    "童话": "Fairy Tales",
    "土耳其": "Turkey",
    "一战": "World War I",
    "医疗": "Healthcare",
    "游戏": "Games",
    "哲学与思想": "Philosophy & Thought",
    "正能量": "Positivity",
    "穿越": "Time Travel",
    "春秋": "Spring and Autumn",
    "帝国": "Empire",
    "敦煌": "Dunhuang",
    "法学": "Jurisprudence",
    "革命": "Revolution",
    "股权": "Equity",
    "故事": "Stories",
    "户外": "Outdoors",
    "画册": "Art Books",
    "剧本": "Scripts",
    "美术": "Fine Arts",
    "美学": "Aesthetics",
    "民族": "Peoples",
    "拿破仑": "Napoleon",
    "南北朝": "Northern & Southern Dynasties",
    "暖心": "Heartwarming",
    "期货": "Futures",
    "乔布斯": "Steve Jobs",
    "秦汉史": "Qin & Han History",
    "权谋": "Stratagems",
    "瑞典": "Sweden",
    "设计": "Design",
    "神怪": "Gods & Spirits",
    "时尚": "Fashion",
    "私募": "Private Equity",
    "四大名著": "Four Great Classics",
    "隋唐史": "Sui & Tang History",
    "统计": "Statistics",
    "外交": "Diplomacy",
    "文集": "Collected Essays",
    "效率": "Productivity",
    "校园": "Campus",
    "心学": "School of Mind",
    "刑法": "Criminal Law",
    "修行": "Self-Cultivation",
    "亚马逊": "Amazon",
    "银行": "Banking",
    "中东": "Middle East",
    "种族": "Race",
    "阿富汗": "Afghanistan",
    "阿根廷": "Argentina",
    "埃及": "Egypt",
    "拜占庭": "Byzantium",
    "曾国藩": "Zeng Guofan",
    "产品": "Product",
    "朝鲜": "Korea",
    "传播": "Media",
    "大清": "Great Qing",
    "丹麦": "Denmark",
    "党史": "Party History",
    "道家": "Daoism",
    "电竞": "Esports",
    "东野圭吾": "Higashino",
    "动漫": "Anime",
    "读物": "Readers",
    "梵高": "Van Gogh",
    "感人": "Moving",
    "估值": "Valuation",
    "规划": "Planning",
    "海军": "Navy",
    "韩国": "South Korea",
    "荷兰": "Netherlands",
    "机器人": "Robotics",
    "技巧": "Technique",
    "绩效": "Performance",
    "减肥": "Weight Loss",
    "解密": "Codebreaking",
    "量子": "Quantum",
    "毛姆": "Maugham",
    "民俗": "Folklore",
    "明清史": "Ming & Qing History",
    "挪威": "Norway",
    "啤酒": "Beer",
    "秦朝": "Qin Dynasty",
    "人类学": "Anthropology",
    "人体": "Human Body",
    "三体": "Three-Body",
    "社科": "Social Sciences",
    "生物学": "Biology",
    "诗经": "Classic of Poetry",
    "石黑一雄": "Ishiguro",
    "苏格兰": "Scotland",
    "投机": "Speculation",
    "团队": "Teams",
    "文化史": "Cultural History",
    "小米": "Xiaomi",
    "小说文学": "Fiction",
    "新闻": "News",
    "信息": "Information",
    "星巴克": "Starbucks",
    "犹太": "Jewish",
    "阅读": "Reading",
    "政治学": "Political Science",
    "自我": "Self",
    "罪案": "Crime Cases",
    "Git与工具": "Git & Tools",
    "Web前端": "Web Frontend",
    "癌症": "Cancer",
    "澳大利亚": "Australia",
    "笔记": "Notes",
    "边疆": "Frontiers",
    "病毒": "Viruses",
    "博弈论": "Game Theory",
    "财商": "Financial Literacy",
    "产业": "Industry",
    "厨房": "Kitchen",
    "词话": "Ci Criticism",
    "慈禧": "Cixi",
    "大汉": "Great Han",
    "大航海": "Age of Discovery",
    "电子商务": "E-commerce",
    "抖音": "Douyin",
    "俄国史": "Russian History",
    "二战史": "WWII History",
    "法国大革命": "French Revolution",
    "方言": "Dialects",
    "访谈": "Interviews",
    "芬兰": "Finland",
    "服饰": "Clothing",
    "复盘": "Review",
    "概率": "Probability",
    "高盛": "Goldman Sachs",
    "格局": "Perspective",
    "宫斗": "Palace Intrigue",
    "古代史": "Ancient History",
    "古典文学": "Classical Literature",
    "古言": "Historical Romance",
    "怪谈": "Strange Tales",
    "海尔": "Haier",
    "航天": "Spaceflight",
    "后宫": "Imperial Harem",
    "化学": "Chemistry",
    "环保": "Conservation",
    "激励": "Motivation",
    "加拿大": "Canada",
    "教学": "Teaching",
    "抗日战争": "Anti-Japanese War",
    "孔子": "Confucius",
    "昆虫": "Insects",
    "李鸿章": "Li Hongzhang",
    "灵修": "Spirituality",
    "留学": "Study Abroad",
    "鲁迅": "Lu Xun",
    "旅游": "Tourism",
    "马拉松": "Marathon",
    "买房": "Home Buying",
    "麦肯锡": "McKinsey",
    "漫威": "Marvel",
    "美国史": "American History",
    "美联储": "Federal Reserve",
    "蒙元史": "Mongol Yuan History",
    "面试与求职": "Interviews & Jobs",
    "冥想": "Meditation",
    "能力": "Ability",
    "女生": "Girls",
    "跑步": "Running",
    "烹饪": "Cooking",
    "彭德怀": "Peng Dehuai",
    "普京": "Putin",
    "期权": "Options",
    "前端": "Frontend",
    "前端开发": "Frontend Development",
    "求职": "Job Hunting",
    "全球化": "Globalization",
    "人力": "Human Resources",
    "日本文学": "Japanese Literature",
    "儒家": "Confucianism",
    "儒学": "Confucian Learning",
    "十字军": "Crusades",
    "石油": "Oil",
    "时间": "Time",
    "史料": "Historical Sources",
    "收藏": "Collecting",
    "手绘": "Hand Drawing",
    "书法": "Calligraphy",
    "书信": "Letters",
    "睡眠": "Sleep",
    "斯大林": "Stalin",
    "四书": "Four Books",
    "宋代": "Song Era",
    "算法": "Algorithms",
    "隋唐": "Sui & Tang",
    "泰国": "Thailand",
    "谈判": "Negotiation",
    "唐代": "Tang Era",
    "腾讯": "Tencent",
    "推理悬疑": "Mystery",
    "晚明": "Late Ming",
    "网络小说": "Web Novels",
    "瘟疫": "Plague",
    "文献学": "Philology",
    "文艺": "Arts & Letters",
    "物理学": "Physics",
    "物流": "Logistics",
    "吸血鬼": "Vampires",
    "西游记": "Journey to the West",
    "希特勒": "Hitler",
    "戏剧": "Drama",
    "系统": "Systems",
    "仙侠": "Xianxia",
    "先秦史": "Pre-Qin History",
    "宪法": "Constitution",
    "心智": "Mindset",
    "芯片": "Chips",
    "幸福": "Happiness",
    "性学": "Sexology",
    "匈牙利": "Hungary",
    "学习方法": "Study Methods",
    "阴谋": "Conspiracy",
    "影评": "Film Reviews",
    "语文": "Chinese Language Arts",
    "越南": "Vietnam",
    "债券": "Bonds",
    "正念": "Mindfulness",
    "证券": "Securities",
    "职业": "Careers",
    "中国史": "History of China",
    "注意力": "Attention",
    "组织": "Organizations",
    "WEB开发": "Web Development",
    "阿里巴巴": "Alibaba",
    "埃博拉": "Ebola",
    "爱迪生": "Edison",
    "爱尔兰": "Ireland",
    "奥地利": "Austria",
    "巴尔干": "Balkans",
    "巴西": "Brazil",
    "编程语言": "Programming Languages",
    "编剧": "Screenwriting",
    "蝙蝠侠": "Batman",
    "兵器": "Weapons",
    "并购": "Mergers & Acquisitions",
    "波兰": "Poland",
    "测试": "Testing",
    "茶": "Tea",
    "禅": "Zen",
    "朝鲜战争": "Korean War",
    "成功学": "Success Studies",
    "成吉思汗": "Genghis Khan",
    "穿搭": "Style",
    "传媒": "Mass Media",
    "创投": "Venture Capital",
    "词集": "Ci Collections",
    "达芬奇": "da Vinci",
    "大自然": "The Natural World",
    "盗墓笔记": "The Grave Robbers' Chronicles",
    "道德经": "Tao Te Ching",
    "地球": "Earth",
    "迪士尼": "Disney",
    "第一次世界大战": "World War I",
    "第一次世界大战回忆录": "World War I Memoirs",
    "电商": "E-commerce",
    "短视频": "Short Video",
    "俄国": "Russia",
    "非虚构": "Nonfiction",
    "福尔摩斯": "Holmes",
    "复杂性": "Complexity",
    "高性价比人生指南.pdf": "High-Value Life Guide",
    "歌赋": "Songs & Fu",
    "狗": "Dogs",
    "鬼怪": "Ghosts",
    "国家": "The State",
    "海明威": "Hemingway",
    "海洋史": "Maritime History",
    "汉语": "Chinese Language",
    "汉字": "Chinese Characters",
    "护肤": "Skincare",
    "火星": "Mars",
    "霍金": "Hawking",
    "鸡尾酒": "Cocktails",
    "基督教": "Christianity",
    "技术分析": "Technical Analysis",
    "加缪": "Camus",
    "家庭教育": "Family Education",
    "甲午战争": "First Sino-Japanese War",
    "江湖": "Jianghu",
    "蒋介石": "Chiang Kai-shek",
    "教材": "Textbooks",
    "近视": "Myopia",
    "京剧": "Peking Opera",
    "经济史": "Economic History",
    "精进": "Self-Improvement",
    "军事谋略": "Military Strategy",
    "烤箱": "Ovens",
    "科幻奇幻": "Sci-Fi & Fantasy",
    "科学家": "Scientists",
    "可口可乐": "Coca-Cola",
    "课程": "Courses",
    "肯尼迪": "Kennedy",
    "拉丁美洲": "Latin America",
    "李白": "Li Bai",
    "李小龙": "Bruce Lee",
    "梁启超": "Liang Qichao",
    "粮食、油脂及植物蛋白工程": "Grain, Oil & Plant Protein",
    "疗愈": "Healing",
    "聊斋": "Liaozhai",
    "伦理学": "Moral Philosophy",
    "论语": "The Analects",
    "罗马史": "Roman History",
    "马云": "Jack Ma",
    "曼德拉": "Mandela",
    "贸易战": "Trade War",
    "美术史": "Art History",
    "魔兽": "Warcraft",
    "谋略": "Tactics",
    "能源": "Energy",
    "女权主义": "Feminism",
    "破案": "Case Solving",
    "葡萄酒": "Wine",
    "葡萄牙": "Portugal",
    "企业家": "Entrepreneurs",
    "亲密关系": "Intimate Relationships",
    "秦始皇": "Qin Shi Huang",
    "全球史": "Global History",
    "人情": "Human Relations",
    "三国演义": "Romance of the Three Kingdoms",
    "商务": "Business",
    "上市": "IPOs",
    "圣经": "The Bible",
    "史书": "Historical Records",
    "世界杯": "World Cup",
    "世界是": "The World Is",
    "视频": "Video",
    "收纳": "Decluttering",
    "数理": "Math & Physics",
    "丝绸之路": "Silk Road",
    "苏轼": "Su Shi",
    "特朗普": "Trump",
    "同性": "LGBTQ",
    "王小波": "Wang Xiaobo",
    "网络时代": "Internet Age",
    "威士忌": "Whiskey",
    "温情": "Tenderness",
    "文化常识": "Cultural Literacy",
    "文化大革命": "Cultural Revolution",
    "文明史": "History of Civilization",
    "武器": "Arms",
    "现代文学": "Modern Literature",
    "相对论": "Relativity",
    "香港随笔": "Hong Kong Essays",
    "新零售": "New Retail",
    "悬爱": "Romantic Suspense",
    "学术": "Scholarship",
    "亚瑟王": "King Arthur",
    "养生": "Wellness",
    "妖怪": "Monsters",
    "伊朗": "Iran",
    "艺术文化": "Arts & Culture",
    "英格兰": "England",
    "英语读物": "English Readers",
    "影视": "Film & TV",
    "用户": "Users",
    "犹太人": "Jews",
    "运动": "Sports",
    "蒸汽朋克": "Steampunk",
    "整理": "Organizing",
    "正则表达式": "Regular Expressions",
    "直销": "Direct Sales",
    "志怪": "Zhiguai",
    "治愈系": "Feel-Good",
    "中医学": "Chinese Medical Studies",
    "朱元璋": "Zhu Yuanzhang",
    "诸葛亮": "Zhuge Liang",
    "资本论": "Das Kapital",
    "自控力": "Self-Control",
    "自律": "Self-Discipline",
    "自然科学": "Natural Science",
    "华尔街": "Wall Street",
    "小说": "Novel",
    "儿童文学": "Children's Literature",
    "科幻": "Sci-Fi",
    "人文与生活": "Humanities & Life",
    "历史": "History",
    "短篇小说": "Short Stories",
    "悬疑": "Mystery",
    "游记与地理": "Travel & Geography",
    "传记": "Biography",
    "战争与军事": "War & Military",
    "随笔": "Essays",
    "自然与博物": "Nature & Natural History",
    "奇幻": "Fantasy",
    "宗教与哲学": "Religion & Philosophy",
    "西部": "Western",
    "冒险": "Adventure",
    "历史小说": "Historical Fiction",
    "书信纪实": "Letters & Memoir",
    "科学与技术": "Science & Technology",
    "政治": "Politics",
    "民俗传说": "Folklore & Legends",
    "通俗小说": "Pulp Fiction",
    "航海": "Seafaring",
    "心理小说": "Psychological Fiction",
  };

  // 书名与键完全一致时，英文界面用通行英译做标题，中文名做副标题。
  // 不匹配续书、注本，也不给没有通行英译的书名现编英文名。
  var TITLE_EN = {
    "红楼梦": "Dream of the Red Chamber",
    "西游记": "Journey to the West",
    "水浒传": "Water Margin",
    "三国演义": "Romance of the Three Kingdoms",
    "论语": "The Analects",
    "聊斋志异": "Strange Tales from a Chinese Studio",
    "围城": "Fortress Besieged",
    "楚辞": "The Songs of the South",
    "孟子": "Mencius",
    "老子": "Tao Te Ching",
    "中庸": "The Doctrine of the Mean",
    "唐诗三百首": "Three Hundred Tang Poems",
    "宋词三百首": "Three Hundred Song Ci Poems",
    "全唐诗": "Complete Tang Poems",
    "野草": "Wild Grass",
    "朝花夕拾": "Dawn Blossoms Plucked at Dusk",
    "儒林外史": "The Scholars",
    "金瓶梅": "The Plum in the Golden Vase",
    "西厢记": "The Story of the Western Wing",
    "牡丹亭": "The Peony Pavilion",
    "镜花缘": "Flowers in the Mirror",
    "封神演义": "Creation of the Gods",
    "世说新语": "A New Account of Tales of the World",
    "文心雕龙": "The Literary Mind and the Carving of Dragons",
    "山海经": "The Classic of Mountains and Seas",
    "老残游记": "The Travels of Lao Can",
    "文选": "Selections of Refined Literature",
    "窦娥冤": "The Injustice to Dou E",
    "别逗了，费曼先生": "Surely You're Joking, Mr. Feynman!",
    "人类简史：从动物到上帝": "Sapiens: A Brief History of Humankind",
    "给忙碌者的天体物理学": "Astrophysics for People in a Hurry",
    "寂静的春天（四师推荐精装版）": "Silent Spring",
    "基因传": "The Gene: An Intimate History",
    "生命是什么：活细胞的物理观": "What Is Life?",
    "生命是什么：40亿年生命史诗的开端": "What Is Life?: How Chemistry Becomes Biology",
    "枪炮、病菌与钢铁 : 人类社会的命运 (世纪人文系列丛书·开放人文)": "Guns, Germs, and Steel",
    "枪炮、病菌和钢铁": "Guns, Germs, and Steel",
    "枪炮、病菌与钢铁（修订版）": "Guns, Germs, and Steel",
    "几何原本": "Euclid's Elements",
    "梦溪笔谈": "Dream Pool Essays",
    "天工开物": "The Exploitation of the Works of Nature",
    "病毒星球": "A Planet of Viruses",
    "细胞生命的礼赞": "The Lives of a Cell",
    "未来简史": "Homo Deus: A Brief History of Tomorrow",
    "十问：霍金沉思录": "Brief Answers to the Big Questions",
    "数学之美": "The Beauty of Mathematics in Computer Science",
    "天演论": "Evolution and Ethics",
    "浪潮之巅": "On Top of Tides",
    // 通行英译。键与目录原文完全一致；没有标准译名的不收录。
    "鬼灭之刃（第一部：卷1卷7）": "Demon Slayer: Kimetsu no Yaiba (Part 1: Vols. 1-7)",
    "鬼灭之刃（第二部：卷8卷15）": "Demon Slayer: Kimetsu no Yaiba (Part 2: Vols. 8-15)",
    "鬼灭之刃（第三部：卷16卷23）": "Demon Slayer: Kimetsu no Yaiba (Part 3: Vols. 16-23)",
    "火影忍者（第1部：卷1~卷7）": "Naruto (Part 1: Vols. 1-7)",
    "火影忍者（第2部：卷8~卷14）": "Naruto (Part 2: Vols. 8-14)",
    "火影忍者（第3部：卷15~卷21）": "Naruto (Part 3: Vols. 15-21)",
    "火影忍者（第4部：卷22~卷27）": "Naruto (Part 4: Vols. 22-27)",
    "火影忍者（第5部：卷28~卷34）": "Naruto (Part 5: Vols. 28-34)",
    "火影忍者（第6部：卷35~卷41）": "Naruto (Part 6: Vols. 35-41)",
    "火影忍者（第7部：卷42~卷48）": "Naruto (Part 7: Vols. 42-48)",
    "火影忍者（第8部：卷49~卷56）": "Naruto (Part 8: Vols. 49-56)",
    "火影忍者（第9部：卷57~卷64）": "Naruto (Part 9: Vols. 57-64)",
    "火影忍者（第10部：卷65~卷72）": "Naruto (Part 10: Vols. 65-72)",
    "火影忍者（外传：宇智波莎罗娜）": "Naruto (Side Story: Sarada Uchiha)",
    "名侦探柯南（第1部：卷1~卷8）": "Detective Conan (Part 1: Vols. 1-8)",
    "名侦探柯南（第2部：卷9~卷16）": "Detective Conan (Part 2: Vols. 9-16)",
    "名侦探柯南（第3部：卷17~卷24）": "Detective Conan (Part 3: Vols. 17-24)",
    "名侦探柯南（第4部：卷25~卷32）": "Detective Conan (Part 4: Vols. 25-32)",
    "名侦探柯南（第5部：卷33~卷40）": "Detective Conan (Part 5: Vols. 33-40)",
    "名侦探柯南（第6部：卷41~卷48）": "Detective Conan (Part 6: Vols. 41-48)",
    "名侦探柯南（第7部：卷49~卷56）": "Detective Conan (Part 7: Vols. 49-56)",
    "名侦探柯南（第8部：卷57~卷64）": "Detective Conan (Part 8: Vols. 57-64)",
    "名侦探柯南（第9部：卷65~卷72）": "Detective Conan (Part 9: Vols. 65-72)",
    "名侦探柯南（第10部：卷73~卷80）": "Detective Conan (Part 10: Vols. 73-80)",
    "名侦探柯南（第11部：卷81~卷88）": "Detective Conan (Part 11: Vols. 81-88)",
    "名侦探柯南（第12部：卷89~卷95）": "Detective Conan (Part 12: Vols. 89-95)",
    "名侦探柯南（第13部：卷96~卷98）": "Detective Conan (Part 13: Vols. 96-98)",
    "乱马（第1部：卷1卷8）": "Ranma 1/2 (Part 1: Vols. 1-8)",
    "乱马（第2部：卷9卷16）": "Ranma 1/2 (Part 2: Vols. 9-16)",
    "乱马（第3部：卷17卷24）": "Ranma 1/2 (Part 3: Vols. 17-24)",
    "乱马（第4部：卷25卷32）": "Ranma 1/2 (Part 4: Vols. 25-32)",
    "乱马（第5部：卷33卷38）": "Ranma 1/2 (Part 5: Vols. 33-38)",
    "哆啦A梦珍藏版（第一部：卷1卷6）": "Doraemon Collector's Edition (Part 1: Vols. 1-6)",
    "哆啦A梦珍藏版（第二部：卷7卷12）": "Doraemon Collector's Edition (Part 2: Vols. 7-12)",
    "哆啦A梦珍藏版（第三部：卷13卷18）": "Doraemon Collector's Edition (Part 3: Vols. 13-18)",
    "哆啦A梦珍藏版（第四部：卷19卷24）": "Doraemon Collector's Edition (Part 4: Vols. 19-24)",
    "哆啦A梦珍藏版（第五部：卷25卷30）": "Doraemon Collector's Edition (Part 5: Vols. 25-30)",
    "哆啦A梦珍藏版（第六部：卷31卷36）": "Doraemon Collector's Edition (Part 6: Vols. 31-36)",
    "哆啦A梦珍藏版（第七部：卷37卷42）": "Doraemon Collector's Edition (Part 7: Vols. 37-42)",
    "哆啦A梦珍藏版（第八部：卷43卷45）": "Doraemon Collector's Edition (Part 8: Vols. 43-45)",
    "龙珠（17卷）": "Dragon Ball (Vols. 1-7)",
    "龙珠（814卷）": "Dragon Ball (Vols. 8-14)",
    "龙珠（1521卷）": "Dragon Ball (Vols. 15-21)",
    "龙珠（2228卷）": "Dragon Ball (Vols. 22-28)",
    "龙珠（2935卷）": "Dragon Ball (Vols. 29-35)",
    "龙珠（3642卷）": "Dragon Ball (Vols. 36-42)",
    "圣斗士星矢（第1部17卷）": "Saint Seiya (Part 1: Vols. 1-7)",
    "圣斗士星矢（第2部814卷）": "Saint Seiya (Part 2: Vols. 8-14)",
    "圣斗士星矢（第3部1521卷）": "Saint Seiya (Part 3: Vols. 15-21)",
    "圣斗士星矢（第4部2228卷）": "Saint Seiya (Part 4: Vols. 22-28)",
    "夏目友人帐（第1部16卷）": "Natsume's Book of Friends (Part 1: Vols. 1-6)",
    "夏目友人帐（第2部712卷）": "Natsume's Book of Friends (Part 2: Vols. 7-12)",
    "夏目友人帐（第3部1318卷）": "Natsume's Book of Friends (Part 3: Vols. 13-18)",
    "夏目友人帐（第4部1921卷）": "Natsume's Book of Friends (Part 4: Vols. 19-21)",
    "新蜡笔小新合集（套装共8册）": "New Crayon Shin-chan Collection (8 volumes)",
    "西游记漫画版全套（共20册）": "Journey to the West: Complete Comic Edition (20 volumes)",
    "水浒传漫画版全套（共20册）": "Water Margin: Complete Comic Edition (20 volumes)",
    "三国演义漫画版全套（共20册）": "Romance of the Three Kingdoms: Complete Comic Edition (20 volumes)",
    "红楼梦漫画版全套（共20册）": "Dream of the Red Chamber: Complete Comic Edition (20 volumes)",
    "武英殿本四库全书总目·上（130册）": "General Catalogue of the Complete Library of the Four Treasuries, Wuyingdian Edition, Part 1 (130 volumes)",
    "武英殿本四库全书总目·下（3160册）": "General Catalogue of the Complete Library of the Four Treasuries, Wuyingdian Edition, Part 2 (3160 volumes)",
    "牛津艺术史系列": "Oxford History of Art, Series 1",
    "史记": "Records of the Grand Historian",
    "资治通鉴": "Comprehensive Mirror to Aid in Government",
    "司马光：资治通鉴": "Comprehensive Mirror to Aid in Government",
    "续资治通鉴": "Continuation of the Comprehensive Mirror to Aid in Government",
    "孙子兵法": "The Art of War",
    "孙膑兵法": "Sun Bin: The Art of Warfare",
    "六韬": "The Six Secret Teachings",
    "韩非子": "Han Feizi",
    "荀子": "Xunzi",
    "墨子": "Mozi",
    "管子": "Guanzi",
    "列子": "Liezi",
    "吕氏春秋": "The Annals of Lü Buwei",
    "淮南子": "The Huainanzi",
    "商君书": "The Book of Lord Shang",
    "公孙龙子": "Gongsun Longzi",
    "战国策": "Intrigues of the Warring States",
    "尚书": "The Book of Documents",
    "礼记": "The Book of Rites",
    "周易": "The Book of Changes",
    "仪礼": "The Book of Etiquette and Ceremonial",
    "周礼": "Rites of Zhou",
    "尔雅": "The Erya",
    "三国志": "Records of the Three Kingdoms",
    "汉书": "The Book of Han",
    "后汉书": "The Book of the Later Han",
    "菜根谭": "Vegetable Roots Discourse",
    "搜神记": "In Search of the Supernatural",
    "子不语": "What the Master Would Not Discuss",
    "阅微草堂笔记": "Notes of the Yuewei Hermitage",
    "酉阳杂俎": "Miscellaneous Morsels from Youyang",
    "穆天子传": "The Tale of King Mu, Son of Heaven",
    "颜氏家训": "Family Instructions for the Yan Clan",
    "徐霞客游记": "The Travel Diaries of Xu Xiake",
    "水经注": "Commentary on the Water Classic",
    "全宋词": "Complete Song Ci Poems",
    "千家诗": "Poems of a Thousand Masters",
    "乐府诗集": "Collection of Yuefu Poems",
    "百家姓": "The Hundred Family Surnames",
    "千字文": "The Thousand Character Classic",
    "了凡四训": "Liao-Fan's Four Lessons",
    "坛经": "The Platform Sutra",
    "楞严经": "The Surangama Sutra",
    "太平经": "The Scripture of Great Peace",
    "周易参同契": "The Seal of the Unity of the Three",
    "抱朴子": "Baopuzi: The Master Who Embraces Simplicity",
    "长生殿": "The Palace of Eternal Life",
    "桃花扇": "The Peach Blossom Fan",
    "官场现形记": "Officialdom Unmasked",
    "二十年目睹之怪现状": "Bizarre Happenings Eyewitnessed over Two Decades",
    "孽海花": "A Flower in a Sinful Sea",
    "东周列国志": "Chronicles of the Eastern Zhou Kingdoms",
    "说岳全传": "The Story of Yue Fei",
    "隋唐演义": "Romance of the Sui and Tang Dynasties",
    "四世同堂": "Four Generations Under One Roof",
    "茶馆": "Teahouse",
    "故事新编": "Old Tales Retold",
    "呐喊彷徨故事新编": "Call to Arms, Wandering, and Old Tales Retold",
    "子夜": "Midnight",
    "林家铺子": "The Shop of the Lin Family",
    "月牙儿": "Crescent Moon",
    "湘行散记": "Recollections of West Hunan",
    "我们仨": "We Three",
    "撒哈拉的故事": "Stories of the Sahara",
    "白鹿原": "White Deer Plain",
    "废都": "Ruined City",
    "浮躁": "Turbulence",
    "秦腔": "Qin Opera",
    "繁花": "Blossoms",
    "一句顶一万句": "Someone to Talk To",
    "红岩": "Red Crag",
    "黄金时代": "The Golden Age",
    "平凡的世界（套装共3册）": "Ordinary World",
    "骆驼祥子（作家榜经典文库）": "Rickshaw Boy",
    "倾城之恋（2019版）": "Love in a Fallen City",
    "尘埃落定（十五周年纪念版）": "Red Poppies",
    "穆斯林的葬礼": "The Jade King",
    "万历十五年": "1587, a Year of No Significance",
    "叫魂": "Soulstealers",
    "三体全集": "The Three-Body Problem: The Complete Trilogy",
    "流浪地球": "The Wandering Earth",
    "球状闪电": "Ball Lightning",
    "超新星纪元": "Supernova Era",
    "孔飞力：叫魂——1768年中国妖术大恐慌": "Soulstealers: The Chinese Sorcery Scare of 1768",
    "德米安：埃米尔·辛克莱的彷徨少年时": "Demian: The Story of Emil Sinclair's Youth",
    "傲慢与偏见": "Pride and Prejudice",
    "战争与和平": "War and Peace",
    "安娜·卡列尼娜": "Anna Karenina",
    "复活": "Resurrection",
    "罪与罚": "Crime and Punishment",
    "卡拉马佐夫兄弟": "The Brothers Karamazov",
    "白夜": "White Nights",
    "百年孤独": "One Hundred Years of Solitude",
    "霍乱时期的爱情": "Love in the Time of Cholera",
    "族长的秋天": "The Autumn of the Patriarch",
    "活着为了讲述": "Living to Tell the Tale",
    "基督山伯爵": "The Count of Monte Cristo",
    "悲惨世界": "Les Misérables",
    "巴黎圣母院": "The Hunchback of Notre-Dame",
    "巴黎圣母院（作家榜经典文库）": "The Hunchback of Notre-Dame",
    "三个火枪手": "The Three Musketeers",
    "茶花女": "The Lady of the Camellias",
    "红与黑": "The Red and the Black",
    "包法利夫人": "Madame Bovary",
    "人间喜剧": "La Comédie Humaine",
    "羊脂球": "Boule de Suif",
    "漂亮朋友": "Bel-Ami",
    "简·爱": "Jane Eyre",
    "呼啸山庄": "Wuthering Heights",
    "双城记": "A Tale of Two Cities",
    "双城记（作家榜经典文库）": "A Tale of Two Cities",
    "雾都孤儿": "Oliver Twist",
    "远大前程（作家榜经典文库）": "Great Expectations",
    "大卫·科波菲尔": "David Copperfield",
    "老人与海": "The Old Man and the Sea",
    "永别了，武器": "A Farewell to Arms",
    "丧钟为谁而鸣": "For Whom the Bell Tolls",
    "乞力马扎罗的雪": "The Snows of Kilimanjaro",
    "了不起的盖茨比": "The Great Gatsby",
    "了不起的盖茨比（作家榜经典文库）": "The Great Gatsby",
    "夜色温柔": "Tender Is the Night",
    "麦田里的守望者": "The Catcher in the Rye",
    "愤怒的葡萄": "The Grapes of Wrath",
    "人鼠之间": "Of Mice and Men",
    "人鼠之间（约翰·斯坦贝克作品系列）": "Of Mice and Men",
    "罐头厂街": "Cannery Row",
    "汤姆·索亚历险记": "The Adventures of Tom Sawyer",
    "哈克贝利·费恩历险记": "Adventures of Huckleberry Finn",
    "白鲸": "Moby-Dick",
    "红字": "The Scarlet Letter",
    "动物农场": "Animal Farm",
    "动物庄园": "Animal Farm",
    "小王子": "The Little Prince",
    "小王子（作家榜经典文库）": "The Little Prince",
    "小王子（成为小王子系列）": "The Little Prince",
    "夜航（成为小王子系列）": "Night Flight",
    "人的大地（成为小王子系列）": "Wind, Sand and Stars",
    "南方邮航（成为小王子系列）": "Southern Mail",
    "月亮和六便士": "The Moon and Sixpence",
    "刀锋": "The Razor's Edge",
    "人生的枷锁": "Of Human Bondage",
    "面纱": "The Painted Veil",
    "寻欢作乐": "Cakes and Ale",
    "杀死一只知更鸟": "To Kill a Mockingbird",
    "追风筝的人": "The Kite Runner",
    "灿烂千阳": "A Thousand Splendid Suns",
    "群山回唱": "And the Mountains Echoed",
    "堂吉诃德": "Don Quixote",
    "堂吉诃德（作家榜经典文库）": "Don Quixote",
    "神曲": "The Divine Comedy",
    "城堡": "The Castle",
    "审判": "The Trial",
    "变形记（作家榜经典文库）": "The Metamorphosis",
    "鼠疫": "The Plague",
    "局外人": "The Stranger",
    "局外人（作家榜经典文库）": "The Stranger",
    "西西弗神话": "The Myth of Sisyphus",
    "堕落": "The Fall",
    "第一个人": "The First Man",
    "仲夏夜之梦（莎士比亚戏剧中文版）": "A Midsummer Night's Dream",
    "威尼斯商人（莎士比亚戏剧中文版）": "The Merchant of Venice",
    "麦克白（莎士比亚戏剧中文版）": "Macbeth",
    "李尔王（莎士比亚戏剧中文版）": "King Lear",
    "暴风雨（莎士比亚戏剧中文版）": "The Tempest",
    "盲眼钟表匠": "The Blind Watchmaker",
    "国富论": "The Wealth of Nations",
    "君主论": "The Prince",
    "理想国": "The Republic",
    "查拉图斯特拉如是说": "Thus Spoke Zarathustra",
    "梦的解析": "The Interpretation of Dreams",
    "爱的艺术": "The Art of Loving",
    "人类简史": "Sapiens: A Graphic History",
    "今日简史": "21 Lessons for the 21st Century",
    "人类群星闪耀时": "Decisive Moments in History",
    "神经漫游者": "Neuromancer",
    "海底两万里": "Twenty Thousand Leagues Under the Seas",
    "八十天环游地球": "Around the World in Eighty Days",
    "地心游记": "Journey to the Center of the Earth",
    "福尔摩斯探案集": "The Complete Sherlock Holmes",
    "少年维特之烦恼": "The Sorrows of Young Werther",
    "少年维特的烦恼": "The Sorrows of Young Werther",
    "浮士德": "Faust",
    "悉达多": "Siddhartha",
    "荒原狼": "Steppenwolf",
    "纳尔齐斯与歌尔德蒙": "Narcissus and Goldmund",
    "钢铁是怎样炼成的": "How the Steel Was Tempered",
    "静静的顿河": "And Quiet Flows the Don",
    "日瓦戈医生": "Doctor Zhivago",
    "大师与玛格丽特": "The Master and Margarita",
    "第二性": "The Second Sex",
    "存在与时间": "Being and Time",
    "就业、利息和货币通论": "The General Theory of Employment, Interest and Money",
    "新教伦理与资本主义精神": "The Protestant Ethic and the Spirit of Capitalism",
    "菊与刀": "The Chrysanthemum and the Sword",
    "菊与刀（增订版）": "The Chrysanthemum and the Sword",
    "零年：1945": "Year Zero: 1945",
    "创造日本：18531964": "Inventing Japan: 1853-1964",
    "日本之镜：日本文化中的英雄与恶人": "A Japanese Mirror: Heroes and Villains of Japanese Culture",
    "东京绮梦": "A Tokyo Romance",
    "罪孽的报应": "The Wages of Guilt",
    "想象的共同体（增订版）": "Imagined Communities",
    "随机漫步的傻瓜": "Fooled by Randomness",
    "思考，快与慢": "Thinking, Fast and Slow",
    "反脆弱：从不确定性中获益": "Antifragile",
    "众病之王：癌症传": "The Emperor of All Maladies",
    "不能承受的生命之轻": "The Unbearable Lightness of Being",
    "源氏物语": "The Tale of Genji",
    "平家物语": "The Tale of the Heike",
    "枕草子": "The Pillow Book",
    "罗生门": "Rashomon",
    "地狱变": "Hell Screen",
    "人间失格": "No Longer Human",
    "人间失格（作家榜经典文库）": "No Longer Human",
    "人间失格（太宰治作品精选集）": "No Longer Human",
    "斜阳（太宰治作品精选集）": "The Setting Sun",
    "女生徒": "Schoolgirl",
    "我是猫": "I Am a Cat",
    "草枕": "Kusamakura",
    "白夜行": "Journey Under the Midnight Sun",
    "嫌疑人X的献身": "The Devotion of Suspect X",
    "解忧杂货店": "The Miracles of the Namiya General Store",
    "恶意": "Malice",
    "新参者": "Newcomer",
    "圣女的救济": "Salvation of a Saint",
    "拉普拉斯的魔女": "Laplace's Witch",
    "魔戒": "The Lord of the Rings",
    "霍比特人": "The Hobbit",
    "霍比特人与魔戒三部曲": "The Hobbit and The Lord of the Rings",
    "哈利波特完整系列": "Harry Potter: The Complete Series",
    "沙丘六部曲": "Dune: The Six-Book Saga",
    "沙丘序曲三部曲": "Prelude to Dune",
    "银河帝国：基地七部曲": "Foundation: The Complete Seven-Book Series",
    "全球通史：1500年以前的世界": "A Global History: The World to 1500",
    "全球通史：1500年以后的世界": "A Global History: The World Since 1500",
    "全球通史：从史前到21世纪（第7版新校本）": "A Global History: From Prehistory to the 21st Century",
    "你一生的故事": "Stories of Your Life and Others",
    "直捣蜂窝的女孩": "The Girl Who Kicked the Hornet's Nest",
    "玩火的女孩": "The Girl Who Played with Fire",
    "皇帝魂": "The Emperor's Soul",
    "菜根谭（作家榜经典文库）": "Vegetable Roots Discourse",
    "红与黑（作家榜经典文库）": "The Red and the Black",
    "漫长的告别（作家榜经典文库）": "The Long Goodbye",
    "猎人笔记（作家榜经典文库）": "A Sportsman's Sketches",
    "道林格雷的画像（作家榜经典文库）": "The Picture of Dorian Gray",
    "隐身人（作家榜经典文库）": "The Invisible Man",
    "套中人（作家榜经典文库）": "The Man in a Case",
    "星际战争（作家榜经典文库）": "The War of the Worlds",
    "变色龙（作家榜经典文库）": "The Chameleon",
    "阴翳礼赞（作家榜经典文库）": "In Praise of Shadows",
    "金银岛（作家榜经典文库）": "Treasure Island",
    "钢铁是怎样炼成的（作家榜经典文库）": "How the Steel Was Tempered",
    "长眠不醒（作家榜经典文库）": "The Big Sleep",
    "莫罗博士岛（作家榜经典文库）": "The Island of Doctor Moreau",
    "孙子兵法青少版（作家榜经典文库）": "The Art of War",
    "名利场（作家榜经典文库）": "Vanity Fair",
    "磨坊信札（作家榜经典文库）": "Letters from My Mill",
    "月亮与六便士（作家榜经典文库）": "The Moon and Sixpence",
    "鲁滨逊漂流记（作家榜经典文库）": "Robinson Crusoe",
    "爱丽丝漫游奇境（作家榜经典文库）": "Alice's Adventures in Wonderland",
    "老人与海（作家榜经典文库）": "The Old Man and the Sea",
    "白鲸（作家榜经典文库）": "Moby-Dick",
    "白鲸（作家榜经典文库）2020版": "Moby-Dick",
    "高老头（作家榜经典文库）": "Père Goriot",
    "绿山墙的安妮（作家榜经典文库）": "Anne of Green Gables",
    "镜花缘（作家榜经典文库）": "Flowers in the Mirror",
    "老残游记（作家榜经典文库）": "The Travels of Lao Can",
    "尼尔斯骑鹅历险记（作家榜经典文库）": "The Wonderful Adventures of Nils",
    "枕草子（作家榜经典文库）": "The Pillow Book",
    "人生的智慧（作家榜经典文库）": "The Wisdom of Life",
    "乌合之众（作家榜经典文库）": "The Crowd",
    "一间自己的房间（作家榜经典文库）": "A Room of One's Own",
    "格列佛游记（作家榜经典文库）": "Gulliver's Travels",
    "在路上（作家榜经典文库）": "On the Road",
    "神曲（作家榜经典文库）": "The Divine Comedy",
    "时间机器（作家榜经典文库）": "The Time Machine",
    "罪与罚（作家榜经典文库）": "Crime and Punishment",
    "都柏林人（作家榜经典文库）": "Dubliners",
    "培根随笔全集（作家榜经典文库）": "Bacon's Essays",
    "达摩流浪者（作家榜经典文库）": "The Dharma Bums",
    "春潮（作家榜经典文库）": "Torrents of Spring",
    "初恋（作家榜经典文库）": "First Love",
    "封神演义（作家榜经典文库）": "Creation of the Gods",
    "唐诗三百首（作家榜经典文库）": "Three Hundred Tang Poems",
    "宋词三百首（作家榜经典文库）": "Three Hundred Song Ci Poems",
    "人性的弱点（作家榜经典文库）": "How to Win Friends and Influence People",
    "约翰·克里斯朵夫（作家榜经典文库）": "Jean-Christophe",
    "银河铁道之夜（作家榜经典文库）": "Night on the Galactic Railroad",
    "第十二夜（莎士比亚戏剧中文版）": "Twelfth Night",
    "奥瑟罗（莎士比亚戏剧中文版）": "Othello",
    "皆大欢喜（莎士比亚戏剧中文版）": "As You Like It",
    "哈姆莱特（莎士比亚戏剧中文版）": "Hamlet",
    "茶馆（作家榜经典文库）": "Teahouse",
    "潘多拉之匣（太宰治作品精选集）": "Pandora's Box",
    "伤心咖啡馆之歌（作家榜经典文库）": "The Ballad of the Sad Café",
    "第三帝国的兴亡（增订版）": "The Rise and Fall of the Third Reich",
    "人间词话（作家榜经典文库）": "Poetic Remarks in the Human World",
    "列那狐的故事（作家榜经典文库）": "Reynard the Fox",
    "父与子全集（作家榜经典文库）": "Father and Son",
    "美丽的约定（作家榜经典文库）": "Le Grand Meaulnes",
    "吹牛大王历险记（作家榜经典文库）": "The Adventures of Baron Munchausen",
    "单向街（作家榜经典文库）": "One-Way Street",
    "猫咪事务所（作家榜经典文库）": "The Cat Office",
    "智慧书（作家榜经典文库）": "The Art of Worldly Wisdom",
    "艺术哲学（作家榜经典文库）": "The Philosophy of Art",
    "纳兰词（作家榜经典文库）": "The Ci Poems of Nalan Xingde",
    "陶渊明集（作家榜经典文库）": "The Collected Works of Tao Yuanming",
    "李煜诗词全集（作家榜经典文库）": "The Poems of Li Yu",
    "阿拉蕾（第1部：卷1~卷6）": "Dr. Slump (Part 1: Vols. 1-6)",
    "阿拉蕾（第2部：卷7~卷12）": "Dr. Slump (Part 2: Vols. 7-12)",
    "阿拉蕾（第3部：卷13~卷18）": "Dr. Slump (Part 3: Vols. 13-18)",
    "埃郡往事": "Essex County",
    "编剧的艺术": "The Art of Dramatic Writing",
    "巴黎卢浮宫": "The Louvre, Paris",
    "巴黎奥赛美术馆": "The Musée d'Orsay, Paris",
    "阿姆斯特丹国家博物馆": "The Rijksmuseum, Amsterdam",
    "阿姆斯特丹梵高博物馆": "The Van Gogh Museum, Amsterdam",
    "阿姆斯特丹：世界最自由城市的历史": "Amsterdam: A History of the World's Most Liberal City",
    "100天后会死的鳄鱼君": "The Crocodile Who Dies in 100 Days",
    "镖人": "Blades of the Guardians",
    "镖人2": "Blades of the Guardians, Vol. 2",
    "镖人3": "Blades of the Guardians, Vol. 3",
    "镖人4": "Blades of the Guardians, Vol. 4",
    "镖人5": "Blades of the Guardians, Vol. 5",
    "镖人6": "Blades of the Guardians, Vol. 6",
    "镖人7": "Blades of the Guardians, Vol. 7",
    "镖人8": "Blades of the Guardians, Vol. 8",
    "镖人9": "Blades of the Guardians, Vol. 9",
    "镖人10": "Blades of the Guardians, Vol. 10",
    "镖人11": "Blades of the Guardians, Vol. 11",
    "当我谈跑步时，我谈些什么": "What I Talk About When I Talk About Running",
    "我的职业是小说家": "Novelist as a Vocation",
    "没有女人的男人们": "Men Without Women",
    "去中国的小船": "A Slow Boat to China",
    "弃猫": "Abandoning a Cat",
    "地下：东京地铁沙林毒气事件实录（套装共2册）": "Underground",
    "盛夏方程式": "A Midsummer's Equation",
    "假面饭店": "Masquerade Hotel",
    "假面之夜": "Masquerade Night",
    "白金数据": "Platinum Data",
    "沉睡的人鱼之家": "The House Where the Mermaid Sleeps",
    "眼之壁": "Wall of Eyes",
    "金色梦乡": "Golden Slumber",
    "姑获鸟之夏": "Summer of the Ubume",
    "所罗门的伪证第Ⅰ部：事件": "Solomon's Perjury, Part I: The Incident",
    "所罗门的伪证第Ⅱ部：决意": "Solomon's Perjury, Part II: Resolution",
    "所罗门的伪证第Ⅲ部：法庭": "Solomon's Perjury, Part III: Court",
    "失乐园": "A Lost Paradise",
    "细雪": "The Makioka Sisters",
    "痴人之爱": "Naomi",
    "爱的饥渴": "Thirst for Love",
    "后来的事": "And Then",
    "津轻": "Tsugaru",
    "小丑之花": "The Flowers of Buffoonery",
    "夏天、烟火和我的尸体": "Summer, Fireworks, and My Corpse",
    "动物园": "Zoo",
    "冰菓套装（共6册）": "Hyouka",
    "阴阳师典藏合集（共5册）": "Onmyoji",
    "妖猫传（全4册）": "Legend of the Demon Cat",
    "罗马人的故事（套装共15册）": "The Story of the Romans",
    "希腊人的故事（全三册）": "The Story of the Greeks",
    "海都物语": "A Tale of the Sea City",
    "长日留痕": "The Remains of the Day",
    "浮世画家": "An Artist of the Floating World",
    "远山淡影": "A Pale View of Hills",
    "无可慰藉": "The Unconsoled",
    "被掩埋的巨人": "The Buried Giant",
    "克拉拉与太阳": "Klara and the Sun",
    "小夜曲": "Nocturnes",
    "没有人给他写信的上校": "No One Writes to the Colonel",
    "苦妓回忆录": "Memories of My Melancholy Whores",
    "迷宫中的将军": "The General in His Labyrinth",
    "爱情和其他魔鬼": "Of Love and Other Demons",
    "一个海难幸存者的故事": "The Story of a Shipwrecked Sailor",
    "世上最美的溺水者": "The Handsomest Drowned Man in the World",
    "番石榴飘香": "The Fragrance of Guava",
    "反抗者": "The Rebel",
    "异乡人": "The Stranger",
    "流亡与独立王国": "Exile and the Kingdom",
    "卡利古拉": "Caligula",
    "正义者": "The Just Assassins",
    "鬼": "Demons",
    "被伤害与侮辱的人们": "The Insulted and the Injured",
    "一九八四": "Nineteen Eighty-Four",
    "坟场之书": "The Graveyard Book",
    "星尘": "Stardust",
    "美国众神（十周年作者修订版）": "American Gods",
    "北欧众神": "Norse Mythology",
    "烟与镜": "Smoke and Mirrors",
    "乌有乡": "Neverwhere",
    "易碎品": "Fragile Things",
    "蜘蛛男孩": "Anansi Boys",
    "高能预警": "Trigger Warning",
    "高堡奇人": "The Man in the High Castle",
    "少数派报告": "The Minority Report",
    "尤比克": "Ubik",
    "流吧！我的眼泪": "Flow My Tears, the Policeman Said",
    "华氏451": "Fahrenheit 451",
    "火星编年史": "The Martian Chronicles",
    "蒲公英醇夏": "Dandelion Wine",
    "夏日永别": "Farewell Summer",
    "十月国度": "The October Country",
    "闪灵": "The Shining",
    "宠物公墓": "Pet Sematary",
    "肖申克的救赎（纪念珍藏版）": "The Shawshank Redemption",
    "它（全2册）": "It",
    "绿里": "The Green Mile",
    "克里斯汀": "Christine",
    "捕梦网": "Dreamcatcher",
    "穹顶之下": "Under the Dome",
    "黑暗塔系列（套装共8册）": "The Dark Tower",
    "112263": "11/22/63",
    "冰与火之歌15卷（全15册）": "A Song of Ice and Fire",
    "冰与火之歌：权力的游戏（图像小说1）": "A Game of Thrones: The Graphic Novel, Vol. 1",
    "冰与火之歌：权力的游戏（图像小说2）": "A Game of Thrones: The Graphic Novel, Vol. 2",
    "冰与火之歌：权力的游戏（图像小说3）": "A Game of Thrones: The Graphic Novel, Vol. 3",
    "冰与火之歌：权力的游戏（图像小说4）": "A Game of Thrones: The Graphic Novel, Vol. 4",
    "血与火：坦格利安王朝史": "Fire & Blood",
    "百变王牌套装": "Wild Cards",
    "永恒的终结": "The End of Eternity",
    "神们自己": "The Gods Themselves",
    "银河帝国：帝国三部曲": "The Galactic Empire Novels",
    "银河帝国：机器人五部曲": "The Robot Novels",
    "与罗摩相会": "Rendezvous with Rama",
    "太空漫游": "A Space Odyssey",
    "神的九十亿个名字": "The Nine Billion Names of God",
    "碟形世界：卫兵！卫兵！": "Guards! Guards!",
    "碟形世界：魔法的颜色": "The Colour of Magic",
    "碟形世界：平等权利": "Equal Rites",
    "碟形世界：异光": "The Light Fantastic",
    "碟形世界：死神学徒": "Mort",
    "碟形世界：金字塔": "Pyramids",
    "碟形世界：大法": "Sourcery",
    "碟形世界：猫和少年魔笛手": "The Amazing Maurice and His Educated Rodents",
    "崩溃：社会如何选择成败兴亡": "Collapse: How Societies Choose to Fail or Succeed",
    "剧变": "Upheaval",
    "自私的基因（40周年增订版）": "The Selfish Gene",
    "祖先的故事": "The Ancestor's Tale",
    "魔鬼的牧师": "A Devil's Chaplain",
    "基因之河": "River Out of Eden",
    "语言本能": "The Language Instinct",
    "心智探奇": "How the Mind Works",
    "白板": "The Blank Slate",
    "思想本质": "The Stuff of Thought",
    "当下的启蒙": "Enlightenment Now",
    "风格感觉：21世纪写作指南": "The Sense of Style",
    "非对称风险": "Skin in the Game",
    "引爆点：如何制造流行": "The Tipping Point",
    "陌生人效应": "Talking to Strangers",
    "逆转": "David and Goliath",
    "万物简史": "A Short History of Nearly Everything",
    "人体简史": "The Body",
    "全民自黑的英国": "Notes from a Small Island",
    "全民发呆的澳洲": "In a Sunburned Country",
    "布莱森英语简史": "The Mother Tongue",
    "圣殿春秋（全3册）": "The Pillars of the Earth",
    "无尽世界（全3册）": "World Without End",
    "巨人的陨落（全3册）": "Fall of Giants",
    "世界的凛冬（全3册）": "Winter of the World",
    "永恒的边缘（全3册）": "Edge of Eternity",
    "永恒火焰（全3册）": "A Column of Fire",
    "风暴岛": "Eye of the Needle",
    "雪人": "The Snowman",
    "蝙蝠": "The Bat",
    "蟑螂": "The Cockroaches",
    "知更鸟": "The Redbreast",
    "五芒星": "The Devil's Star",
    "幽灵": "Phantom",
    "警察": "Police",
    "救赎者": "The Redeemer",
    "猎豹（全二册）": "The Leopard",
    "焦渴": "The Thirst",
    "猎头游戏": "Headhunters",
    "捕鼠器": "The Mousetrap",
    "阿加莎·克里斯蒂自传": "Agatha Christie: An Autobiography",
    "马普尔小姐探案全集": "Miss Marple: The Complete Mysteries",
    "大侦探波洛探案全集": "Hercule Poirot: The Complete Mysteries",
    "莎士比亚全集（套装共10本）": "The Complete Works of Shakespeare",
    "莎士比亚四大悲剧": "Four Great Tragedies",
    "医学的真相": "The Laws of Medicine",
    "南方之星": "The Star of the South",
    "北方反对南方": "North Against South"
  };

  function subcategoryLabel(key) {
    if (currentLang === "zh-CN") {
      if (Object.prototype.hasOwnProperty.call(SUBCATEGORY_LABELS, key)) return SUBCATEGORY_LABELS[key];
      return key;
    }
    if (Object.prototype.hasOwnProperty.call(SUBCATEGORY_EN, key)) return SUBCATEGORY_EN[key];
    return key;
  }

  // 目录用拉丁字母存的中国作者。两种语言都显示汉字，不把中文作者转写成拼音。
  var AUTHOR_ZH = {
    "Laozi": "老子",
    "Mencius": "孟子",
    "Xun Lu": "鲁迅",
    "Jingzi Wu": "吴敬梓",
    "Xianzu Tang": "汤显祖",
    // 通行英译。键与目录原文完全一致；没有标准译名的不收录。
    "Guanzhong Luo": "罗贯中",
    "Xiang Liu": "刘向",
    "Kuo Shen": "沈括",
    "Jianren Wu": "吴趼人",
    "active 150 B.C. Ying Han": "韩婴",
    "Tianhuazangzhuren": "天花藏主人",
    "active 317-322 Bao Gan": "干宝",
    "Zhitui Yan": "颜之推",
    "Menglong Feng": "冯梦龙",
    "Qian Tao": "陶潜",
    "Shizhen Wang": "王世贞",
    "Mengchu Ling": "凌濛初",
    "Mei Yuan": "袁枚",
    "Shi Su": "苏轼",
    "Hanqing Guan": "关汉卿",
    "active 1596 Zicheng Hong": "洪自诚",
    "Boyuan Li": "李伯元",
    "E Liu": "刘鹗",
    "Yiqing Liu": "刘义庆",
    "Songling Pu": "蒲松龄",
    "active 6th century B.C. Sunzi": "孙武",
    "Yangming Wang": "王阳明",
    "Dai Zhang": "张岱",
    "Ming Zuoqiu": "左丘明",
    "Hong Ge": "葛洪",
    "Xiu Ouyang": "欧阳修",
    "Yang Shang": "商鞅",
    "Xueqin Cao": "曹雪芹",
    "Zhi Cao": "曹植",
    "Shou Chen": "陈寿",
    "Confucius": "孔子",
    "Yanwu Gu": "顾炎武",
    "Bangqing Han": "韩邦庆",
    "Fei Han": "韩非",
    "Bai Li": "李白",
    "Ruzhen Li": "李汝珍",
    "An Liu": "刘安",
    "Xie Liu": "刘勰",
    "Di Mo": "墨翟",
    "Nai'an Shi": "施耐庵",
    "Qian Sima": "司马迁",
    "Yingxing Song": "宋应星",
    "Tuotuo": "脱脱",
    "Shifu Wang": "王实甫",
    "Cheng'en Wu": "吴承恩",
    "Xiaoxiaosheng": "兰陵笑笑生",
    "Xingsi Zhou": "周兴嗣",
    "active 168-196 Zhongjing Zhang": "张仲景",
    "active 4th century Jia Wang": "王嘉",
    "Gu Ban": "班固",
    "Baowenglaoren": "抱瓮老人",
    "Qingxincairen": "青心才人",
    "Fu Shen": "沈复",
    "active 4th century B.C. Guiguzi": "鬼谷子",
    "active 4th century B.C. Liezi": "列子",
    "Zhong Guan": "管仲",
    "Xi Zhu": "朱熹",
    "Pu Zeng": "曾朴",
    "Pu Guo": "郭璞",
    "Shangren Kong": "孔尚任",
    "Cixin Liu": "刘慈欣",
    "Zhihua Zhou": "周志华",
    "Dafu Yu": "郁达夫",
    "Chao Zhang": "张潮",
    "Chen Chen": "陈忱",
    "Kun Lü": "吕坤",
    "Fu Kong": "孔鲋",
    "Xixing Lu": "陆西星",
    "Zhen Lin": "林鍼",
    "Yi Zhao": "赵翼",
    "Yu Li": "李渔",
    "Ainajushi": "艾衲居士",
    "Xihuyuyinzhuren": "西湖渔隐主人",
    "Tanmengdaoren": "贪梦道人",
    "active 18th century Su'anzhuren": "素庵主人",
    "active 1842-1851 Wenkang": "文康",
    "active 16th century Damu Xiong": "熊大木"
  };

  // 目录已经是英文的外国人名。只在中文界面换成通行中文名。
  var AUTHOR_ZH_FOREIGN = {
    "James Legge": "理雅各",
    // 通行英译。键与目录原文完全一致；没有标准译名的不收录。
    "Anonymous": "佚名",
    "Ken Liu": "刘宇昆",
    "Yiyun Li": "李翊云"
  };

  // 英文界面只替换能确定的外国人名。中文作者、空作者、佚名以外的不确定名字保持原样。
  var AUTHOR_EN = {
    "理查德・费曼": "Richard P. Feynman",
    "尼尔・德格拉斯・泰森": "Neil deGrasse Tyson",
    "尼尔・德格拉斯・泰森/唐纳德・戈德史密斯": "Neil deGrasse Tyson / Donald Goldsmith",
    "蕾切尔・卡森": "Rachel Carson",
    "悉达多・穆克吉": "Siddhartha Mukherjee",
    "埃尔温・薛定谔": "Erwin Schrödinger",
    "埃迪・普罗斯": "Addy Pross",
    "贾雷德·戴蒙德": "Jared Diamond",
    "贾雷德・戴蒙德": "Jared Diamond",
    "卡尔・齐默": "Carl Zimmer",
    "刘易斯・托马斯": "Lewis Thomas",
    "尤瓦尔・赫拉利": "Yuval Noah Harari",
    "[以色列]尤瓦尔·赫拉利": "Yuval Noah Harari",
    "（英）史蒂芬·霍金": "Stephen Hawking",
    "史蒂芬・霍金": "Stephen Hawking",
    "斯蒂芬・霍金": "Stephen Hawking",
    "欧几里得": "Euclid",
    // 通行英译。键与目录原文完全一致；没有标准译名的不收录。
    "斯蒂芬・金": "Stephen King",
    "威廉・莎士比亚": "William Shakespeare",
    "帕特里克・莫迪亚诺": "Patrick Modiano",
    "威廉・萨姆塞特・毛姆": "W. Somerset Maugham",
    "威廉・萨默塞特・毛姆": "W. Somerset Maugham",
    "阿尔贝・加缪": "Albert Camus",
    "加西亚・马尔克斯": "Gabriel García Márquez",
    "尤・奈斯博": "Jo Nesbø",
    "肯・福莱特": "Ken Follett",
    "雷蒙德・钱德勒": "Raymond Chandler",
    "阿兰・德波顿": "Alain de Botton",
    "菲利普・罗斯": "Philip Roth",
    "尼尔・盖曼": "Neil Gaiman",
    "比尔・布莱森": "Bill Bryson",
    "特里・普拉切特": "Terry Pratchett",
    "罗贝托・波拉尼奥": "Roberto Bolaño",
    "弗雷德里克・巴克曼": "Fredrik Backman",
    "阿摩司・奥兹": "Amos Oz",
    "玛格丽特・阿特伍德": "Margaret Atwood",
    "约翰・布罗克曼": "John Brockman",
    "彼得・汉德克": "Peter Handke",
    "约翰・斯卡尔齐": "John Scalzi",
    "约翰・欧文": "John Irving",
    "哈罗德・布鲁姆": "Harold Bloom",
    "弗朗西斯・福山": "Francis Fukuyama",
    "乔治・奥威尔": "George Orwell",
    "阿加莎・克里斯蒂": "Agatha Christie",
    "约翰・斯坦贝克": "John Steinbeck",
    "藤子·F·不二雄": "Fujiko F. Fujio",
    "雷・布拉德伯里": "Ray Bradbury",
    "理查德・道金斯": "Richard Dawkins",
    "欧内斯特・海明威": "Ernest Hemingway",
    "乔治·R.R.马丁": "George R. R. Martin",
    "奥森・斯科特・卡德": "Orson Scott Card",
    "阿瑟・克拉克": "Arthur C. Clarke",
    "西蒙・蒙蒂菲奥里": "Simon Sebag Montefiore",
    "戴维・洛奇": "David Lodge",
    "埃莱娜・费兰特": "Elena Ferrante",
    "查尔斯・狄更斯": "Charles Dickens",
    "狄更斯": "Charles Dickens",
    "列夫・托尔斯泰": "Leo Tolstoy",
    "托尔斯泰": "Leo Tolstoy",
    "菲利普・迪克": "Philip K. Dick",
    "伊恩・布鲁玛": "Ian Buruma",
    "儒勒・凡尔纳": "Jules Verne",
    "凡尔纳": "Jules Verne",
    "马克斯・韦伯": "Max Weber",
    "爱德华・威尔逊": "Edward O. Wilson",
    "巴巴拉・W・塔奇曼": "Barbara W. Tuchman",
    "巴巴拉・塔奇曼": "Barbara W. Tuchman",
    "史蒂芬・平克": "Steven Pinker",
    "博多・舍费尔": "Bodo Schäfer",
    "西德尼・谢尔顿": "Sidney Sheldon",
    "埃里希・玛丽亚・雷马克": "Erich Maria Remarque",
    "丹・西蒙斯": "Dan Simmons",
    "史蒂芬・柯维": "Stephen R. Covey",
    "劳伦斯・布洛克": "Lawrence Block",
    "马洛伊・山多尔": "Sándor Márai",
    "爱德华・圣奥宾": "Edward St. Aubyn",
    "蒂姆・哈福德": "Tim Harford",
    "卡尔・奥韦・克瑙斯高": "Karl Ove Knausgård",
    "维克多・雨果": "Victor Hugo",
    "雨果": "Victor Hugo",
    "索尔・贝娄": "Saul Bellow",
    "布琳・布朗": "Brené Brown",
    "马尔科姆・格拉德威尔": "Malcolm Gladwell",
    "斯蒂芬・茨威格": "Stefan Zweig",
    "斯・茨威格": "Stefan Zweig",
    "斯特凡・茨威格": "Stefan Zweig",
    "伊恩・麦克尤恩": "Ian McEwan",
    "威尔・杜兰特": "Will Durant",
    "奥斯卡・王尔德": "Oscar Wilde",
    "赫尔曼・黑塞": "Hermann Hesse",
    "赫尔曼?黑塞": "Hermann Hesse",
    "罗曼・罗兰": "Romain Rolland",
    "赫伯特・乔治・威尔斯": "H. G. Wells",
    "艾萨克・阿西莫夫": "Isaac Asimov",
    "阿尔弗雷德・阿德勒": "Alfred Adler",
    "约翰・迪克森・卡尔": "John Dickson Carr",
    "罗尔德・达尔": "Roald Dahl",
    "保罗・索鲁": "Paul Theroux",
    "弗吉尼亚・伍尔夫": "Virginia Woolf",
    "库尔特・冯内古特": "Kurt Vonnegut",
    "威廉・吉布森": "William Gibson",
    "埃德加・爱伦・坡": "Edgar Allan Poe",
    "沃尔特・艾萨克森": "Walter Isaacson",
    "豪尔赫・路易斯・博尔赫斯": "Jorge Luis Borges",
    "詹姆斯・乔伊斯": "James Joyce",
    "查克・温迪格": "Chuck Wendig",
    "理查德・耶茨": "Richard Yates",
    "威廉・福克纳": "William Faulkner",
    "戴尔・卡耐基": "Dale Carnegie",
    "朱利安・巴恩斯": "Julian Barnes",
    "马特・海格": "Matt Haig",
    "托马斯・沃尔夫": "Thomas Wolfe",
    "托马斯・品钦": "Thomas Pynchon",
    "梅兰妮・克莱因": "Melanie Klein",
    "艾瑞克·霍布斯鲍姆": "Eric Hobsbawm",
    "塞萨尔・艾拉": "César Aira",
    "亨利・基辛格": "Henry Kissinger",
    "加・泽文": "Gabrielle Zevin",
    "珍妮特・温特森": "Jeanette Winterson",
    "弗朗索瓦・阿赫托戈": "François Hartog",
    "杰夫・戴尔": "Geoff Dyer",
    "弗里德里希・尼采": "Friedrich Nietzsche",
    "尼采": "Friedrich Nietzsche",
    "欧・亨利": "O. Henry",
    "克莱儿・麦克福尔": "Claire McFall",
    "科马克・麦卡锡": "Cormac McCarthy",
    "杰克・凯鲁亚克": "Jack Kerouac",
    "迈克尔・桑德尔": "Michael J. Sandel",
    "达芙妮・杜穆里埃": "Daphne du Maurier",
    "伊恩・托尔": "Ian W. Toll",
    "罗伯特・哈格斯特朗": "Robert G. Hagstrom",
    "阿道司・赫胥黎": "Aldous Huxley",
    "奥兰多・费吉斯": "Orlando Figes",
    "夏洛蒂・勃朗特": "Charlotte Brontë",
    "艾米莉・勃朗特": "Emily Brontë",
    "爱米丽・勃朗特": "Emily Brontë",
    "蕾秋・乔伊斯": "Rachel Joyce",
    "勒内・格鲁塞": "René Grousset",
    "皮耶尔・勒迈特": "Pierre Lemaitre",
    "爱德华・德博诺": "Edward de Bono",
    "大卫・克里斯蒂安": "David Christian",
    "马克・李维": "Marc Levy",
    "奇普・希思/丹・希思": "Chip Heath / Dan Heath",
    "克莱顿・克里斯坦森": "Clayton M. Christensen",
    "威廉・庞德斯通": "William Poundstone",
    "彼得・渥雷本": "Peter Wohlleben",
    "戴维・迈尔斯": "David G. Myers",
    "赫尔曼・麦尔维尔": "Herman Melville",
    "赫尔曼・梅尔维尔": "Herman Melville",
    "丽莎・兰道尔": "Lisa Randall",
    "卡洛・罗韦利": "Carlo Rovelli",
    "彼得・德鲁克": "Peter F. Drucker",
    "若泽・萨拉马戈": "José Saramago",
    "盖伊・特立斯": "Gay Talese",
    "玛格丽特・尤瑟纳尔": "Marguerite Yourcenar",
    "厄休拉・勒古恩": "Ursula K. Le Guin",
    "维罗尼卡・罗斯": "Veronica Roth",
    "艾丽丝・门罗": "Alice Munro",
    "威廉・麦克尼尔": "William H. McNeill",
    "朱迪・皮考特": "Jodi Picoult",
    "道格拉斯・亚当斯": "Douglas Adams",
    "赫尔曼・沃克": "Herman Wouk",
    "迈克尔・刘易斯": "Michael Lewis",
    "理查德・怀斯曼": "Richard Wiseman",
    "扬・马特尔": "Yann Martel",
    "马丁・瓦尔泽": "Martin Walser",
    "迈克尔・夏邦": "Michael Chabon",
    "彼得・圣吉": "Peter M. Senge",
    "大卫・阿尔蒙德": "David Almond",
    "乔治・巴塔耶": "Georges Bataille",
    "约翰・厄普代克": "John Updike",
    "儒勒・米什莱": "Jules Michelet",
    "弗朗索瓦丝・萨冈": "Françoise Sagan",
    "哈珀・李": "Harper Lee",
    "翁贝托・埃科": "Umberto Eco",
    "翁贝托・艾柯": "Umberto Eco",
    "特德・姜": "Ted Chiang",
    "布兰登・桑德森": "Brandon Sanderson",
    "约翰・勒卡雷": "John le Carré",
    "罗伯特・西奥迪尼": "Robert B. Cialdini",
    "斯蒂格・拉森": "Stieg Larsson",
    "费尔南多・佩索阿": "Fernando Pessoa",
    "奥尔加・托卡尔丘克": "Olga Tokarczuk",
    "瑞・达利欧": "Ray Dalio",
    "纳尔逊・曼德拉": "Nelson Mandela",
    "托马斯・哈代": "Thomas Hardy",
    "彼得・海斯勒": "Peter Hessler",
    "菲利普・津巴多": "Philip Zimbardo",
    "简・奥斯丁": "Jane Austen",
    "简・奥斯汀": "Jane Austen",
    "乔纳斯・嘉德尔": "Jonas Gardell",
    "乔斯坦・贾德": "Jostein Gaarder",
    "马塞尔・普鲁斯特": "Marcel Proust",
    "米哈伊尔・布尔加科夫": "Mikhail Bulgakov",
    "布尔加科夫": "Mikhail Bulgakov",
    "卡勒德・胡赛尼": "Khaled Hosseini",
    "丹・布朗": "Dan Brown",
    "伊塔洛・卡尔维诺": "Italo Calvino",
    "奥尔罕・帕慕克": "Orhan Pamuk",
    "帕特里克・聚斯金德": "Patrick Süskind",
    "普里莫・莱维": "Primo Levi",
    "杜鲁门・卡波特": "Truman Capote",
    "阿瑟・黑利": "Arthur Hailey",
    "诺姆・乔姆斯基": "Noam Chomsky",
    "斯坦尼斯瓦夫・莱姆": "Stanisław Lem",
    "安东・契诃夫": "Anton Chekhov",
    "契诃夫": "Anton Chekhov",
    "本杰明・格雷厄姆": "Benjamin Graham",
    "詹姆斯・格雷克": "James Gleick",
    "弗拉基米尔・纳博科夫": "Vladimir Nabokov",
    "托马斯・曼": "Thomas Mann",
    "约翰・杜威": "John Dewey",
    "阿图尔・叔本华": "Arthur Schopenhauer",
    "伯特兰・罗素": "Bertrand Russell",
    "卡尔・波普尔": "Karl Popper",
    "乔纳森・斯威夫特": "Jonathan Swift",
    "丹尼尔・笛福": "Daniel Defoe",
    "伊夫林・沃": "Evelyn Waugh",
    "亨利・詹姆斯": "Henry James",
    "杰克・伦敦": "Jack London",
    "苏珊・桑塔格": "Susan Sontag",
    "希拉里・曼特尔": "Hilary Mantel",
    "吉莉安・弗琳": "Gillian Flynn",
    "迈克尔・康奈利": "Michael Connelly",
    "胡里奥・科塔萨尔": "Julio Cortázar",
    "胡利奥・科塔萨尔": "Julio Cortázar",
    "安德烈・纪德": "André Gide",
    "阿尔文・托夫勒": "Alvin Toffler",
    "谢丽尔・桑德伯格": "Sheryl Sandberg",
    "本・伯南克": "Ben Bernanke",
    "亚当・格兰特": "Adam Grant",
    "本尼迪克特・安德森": "Benedict Anderson",
    "尼尔・斯蒂芬森": "Neal Stephenson",
    "罗伯特・海因莱因": "Robert A. Heinlein",
    "安迪・威尔": "Andy Weir",
    "兰道尔・门罗": "Randall Munroe",
    "康妮・威利斯": "Connie Willis",
    "汤姆・克兰西": "Tom Clancy",
    "安东尼・伯吉斯": "Anthony Burgess",
    "达希尔・哈米特": "Dashiell Hammett",
    "雪莉・杰克逊": "Shirley Jackson",
    "艾・里斯/劳拉・里斯": "Al Ries / Laura Ries",
    "[日]东野圭吾": "Keigo Higashino",
    "[日] 东野圭吾": "Keigo Higashino",
    "村上春树": "Haruki Murakami",
    "松本清张": "Seicho Matsumoto",
    "川端康成": "Yasunari Kawabata",
    "三岛由纪夫": "Yukio Mishima",
    "夏目漱石": "Natsume Soseki",
    "谷崎润一郎": "Junichiro Tanizaki",
    "芥川龙之介": "Ryunosuke Akutagawa",
    "宫部美雪": "Miyuki Miyabe",
    "伊坂幸太郎": "Kotaro Isaka",
    "京极夏彦": "Natsuhiko Kyogoku",
    "绫辻行人": "Yukito Ayatsuji",
    "乙一": "Otsuichi",
    "米泽穗信": "Honobu Yonezawa",
    "盐野七生": "Nanami Shiono",
    "梦枕貘": "Baku Yumemakura",
    "坂口安吾": "Ango Sakaguchi",
    "渡边淳一": "Junichi Watanabe",
    "稻盛和夫": "Kazuo Inamori",
    "一行禅师": "Thich Nhat Hanh",
    "韩炳哲": "Byung-Chul Han",
    "池井户润": "Jun Ikeido",
    "陈舜臣": "Chin Shunshin",
    "小泉八云": "Lafcadio Hearn",
    "柳田国男": "Kunio Yanagita",
    "田中贡太郎": "Kotaro Tanaka",
    "紫式部": "Murasaki Shikibu",
    "太宰治": "Osamu Dazai",
    "青山刚昌": "Gosho Aoyama",
    "鸟山明": "Akira Toriyama",
    "岸本齐史": "Masashi Kishimoto",
    "吾峠呼世晴": "Koyoharu Gotouge",
    "高桥留美子": "Rumiko Takahashi",
    "车田正美": "Masami Kurumada",
    "绿川幸": "Yuki Midorikawa",
    "臼井仪人": "Yoshito Usui",
    "孔飞力": "Philip A. Kuhn",
    "斯塔夫里阿诺斯": "L. S. Stavrianos",
    "大仲马": "Alexandre Dumas",
    "亚历山大・仲马": "Alexandre Dumas",
    "福楼拜": "Gustave Flaubert",
    "居斯达夫・福楼拜": "Gustave Flaubert",
    "莫泊桑": "Guy de Maupassant",
    "司汤达": "Stendhal",
    "但丁": "Dante Alighieri",
    "塞万提斯": "Miguel de Cervantes",
    "卡夫卡": "Franz Kafka",
    "弗兰茨・卡夫卡": "Franz Kafka",
    "柏拉图": "Plato",
    "陀思妥耶夫斯基": "Fyodor Dostoevsky",
    "帕斯捷尔纳克": "Boris Pasternak",
    "鲍里斯・帕斯捷尔纳克": "Boris Pasternak",
    "尼・奥斯特洛夫斯基": "Nikolai Ostrovsky",
    "米・肖洛霍夫": "Mikhail Sholokhov",
    "米兰·昆德拉": "Milan Kundera",
    "米兰・昆德拉": "Milan Kundera",
    "亚当·斯密": "Adam Smith",
    "亚当・斯密": "Adam Smith",
    "J·K·罗琳": "J. K. Rowling",
    "J・K・罗琳": "J. K. Rowling",
    "V.S.奈保尔": "V. S. Naipaul",
    "企鹅经典": "Penguin Classics",
    "牛津通识读本": "Oxford Very Short Introductions",
    "柯南・道尔": "Arthur Conan Doyle",
    "阿瑟・柯南・道尔": "Arthur Conan Doyle",
    "圣埃克苏佩里": "Antoine de Saint-Exupéry",
    "安托万・德・圣埃克苏佩里": "Antoine de Saint-Exupéry",
    "圣-埃克苏佩里": "Antoine de Saint-Exupéry",
    "埃克苏佩里": "Antoine de Saint-Exupéry",
    "菲茨杰拉德": "F. Scott Fitzgerald",
    "斯科特・菲茨杰拉德": "F. Scott Fitzgerald",
    "弗・司各特・菲茨杰拉德": "F. Scott Fitzgerald",
    "马克・吐温": "Mark Twain",
    "约翰・沃尔夫冈・歌德": "Johann Wolfgang von Goethe",
    "弗洛伊德": "Sigmund Freud",
    "西格蒙德・弗洛伊德": "Sigmund Freud",
    "艾里希・弗洛姆": "Erich Fromm",
    "丹尼尔・卡尼曼": "Daniel Kahneman",
    "纳西姆・尼古拉斯・塔勒布": "Nassim Nicholas Taleb",
    "戴纳西姆・尼古拉斯・塔勒布": "Nassim Nicholas Taleb",
    "塔勒布": "Nassim Nicholas Taleb",
    "杰罗姆・大卫・塞林格": "J. D. Salinger",
    "纳撒尼尔・霍桑": "Nathaniel Hawthorne",
    "马丁・海德格尔": "Martin Heidegger",
    "约翰・梅纳德・凯恩斯": "John Maynard Keynes",
    "鲁思・本尼迪克特": "Ruth Benedict",
    "伊恩・布鲁马/鲁思・本尼迪克特": "Ian Buruma / Ruth Benedict",
    "J.R.R. 托尔金": "J. R. R. Tolkien",
    "弗兰克・赫伯特": "Frank Herbert",
    "布莱恩・赫伯特": "Brian Herbert",
    "伊万・谢尔盖耶维奇・屠格涅夫": "Ivan Turgenev",
    "伊凡・谢尔盖耶维奇・屠格涅夫": "Ivan Turgenev",
    "屠格涅夫": "Ivan Turgenev",
    "宫泽贤治": "Kenji Miyazawa",
    "樋口一叶": "Ichiyo Higuchi",
    "罗伯特・路易斯・史蒂文森": "Robert Louis Stevenson",
    "尼古拉・奥斯特洛夫斯基": "Nikolai Ostrovsky",
    "萨克雷": "William Makepeace Thackeray",
    "阿尔封斯・都德": "Alphonse Daudet",
    "刘易斯・卡罗尔": "Lewis Carroll",
    "奥诺雷·德·巴尔扎克": "Honoré de Balzac",
    "露西・莫德・蒙格玛丽": "L. M. Montgomery",
    "清少纳言": "Sei Shonagon",
    "古斯塔夫・勒庞": "Gustave Le Bon",
    "维吉尼亚・伍尔夫": "Virginia Woolf",
    "但丁・阿利吉耶里": "Dante Alighieri",
    "费奥多尔・米哈伊洛维奇・陀思妥耶夫斯基": "Fyodor Dostoevsky",
    "塞尔玛・拉格洛夫": "Selma Lagerlöf",
    "埃・拉斯伯": "Rudolf Erich Raspe",
    "阿兰・傅尼埃": "Alain-Fournier",
    "瓦尔特・本雅明": "Walter Benjamin",
    "威廉・卡克斯顿": "William Caxton",
    "巴尔塔萨尔・格拉西安": "Baltasar Gracián",
    "H. A. 丹纳": "Hippolyte Taine",
    "威廉・夏伊勒": "William L. Shirer",
    "卡森・麦卡勒斯": "Carson McCullers",
    "埃・奥・卜劳恩": "E. O. Plauen",
    "拉宾德拉纳特・泰戈尔": "Rabindranath Tagore",
    "儒勒・列那尔": "Jules Renard",
    "杰夫・勒米尔": "Jeff Lemire",
    "拉约什・埃格里": "Lajos Egri",
    "菊池祐纪": "Yuki Kikuchi",
    "中野京子": "Kyoko Nakano",
    "达尼埃拉・塔拉布拉": "Daniela Tarabra",
    "马特・里德利": "Matt Ridley",
    "史蒂文・约翰逊": "Steven Johnson",
    "约翰・格里宾": "John Gribbin",
    "伦纳德・蒙洛迪诺": "Leonard Mlodinow",
    "列纳德・蒙洛迪诺": "Leonard Mlodinow",
    "丹・琼斯": "Dan Jones",
    "斯坦尼斯拉斯・迪昂": "Stanislas Dehaene",
    "莱内・马利亚・里尔克": "Rainer Maria Rilke",
    "亨利・戴维・梭罗": "Henry David Thoreau",
    "罗尔夫・多贝里": "Rolf Dobelli",
    "彼得・沃森": "Peter Watson",
    "扶霞・邓洛普": "Fuchsia Dunlop",
    "阿尔贝托・莫拉维亚": "Alberto Moravia",
    "大卫・伊格曼": "David Eagleman",
    "马丁・塞利格曼": "Martin Seligman",
    "罗杰・克劳利": "Roger Crowley",
    "沙希利・浦洛基": "Serhii Plokhy",
    "彼得・希瑟": "Peter Heather",
    "诺曼・戴维斯": "Norman Davies",
    "特里・伊格尔顿": "Terry Eagleton",
    "吉姆・罗杰斯": "Jim Rogers",
    "克劳德・霍普金斯": "Claude C. Hopkins",
    "约翰・格林": "John Green",
    "克莉丝汀・汉娜": "Kristin Hannah",
    "查尔斯・汉迪": "Charles Handy",
    "迈克斯・泰格马克": "Max Tegmark",
    "约翰・威廉斯": "John Williams",
    "曼瑟・奥尔森": "Mancur Olson",
    "托尼・朱特": "Tony Judt",
    "以赛亚・伯林": "Isaiah Berlin",
    "以赛亚・伯林爵士": "Sir Isaiah Berlin",
    "皮尔斯・布朗": "Pierce Brown",
    "罗宾・霍布": "Robin Hobb",
    "卡尔・纽波特": "Cal Newport",
    "尼古拉斯・卡尔": "Nicholas Carr",
    "托马斯・福斯特": "Thomas C. Foster",
    "朱利安・巴吉尼": "Julian Baggini",
    "保罗・巴奇加卢皮": "Paolo Bacigalupi",
    "丹尼尔・席尔瓦": "Daniel Silva",
    "裘帕・拉希莉": "Jhumpa Lahiri",
    "爱德华多・加莱亚诺": "Eduardo Galeano",
    "彼得・林奇": "Peter Lynch",
    "杰克・特劳特": "Jack Trout",
    "凯特・莫顿": "Kate Morton",
    "卡洛斯・卡斯塔尼达": "Carlos Castaneda",
    "欧文・亚隆": "Irvin D. Yalom",
    "威廉・欧奈尔": "William J. O'Neil",
    "乔乔・莫伊斯": "Jojo Moyes",
    "阿图・葛文德": "Atul Gawande",
    "约翰・伯格": "John Berger",
    "约翰・基根": "John Keegan",
    "保罗・约翰逊": "Paul Johnson",
    "米盖尔・安赫尔・阿斯图里亚斯": "Miguel Ángel Asturias",
    "格雷琴・鲁宾": "Gretchen Rubin",
    "艾丽丝・默多克": "Iris Murdoch",
    "罗宾・邓巴": "Robin Dunbar",
    "珍・哈珀": "Jane Harper",
    "弗诺・文奇": "Vernor Vinge",
    "玛丽・比尔德": "Mary Beard",
    "尼尔・弗格森": "Niall Ferguson",
    "伊查克・爱迪思": "Ichak Adizes",
    "约翰・托兰": "John Toland",
    "约翰・博格": "John C. Bogle",
    "保罗・策兰": "Paul Celan",
    "贝尔・格里尔斯": "Bear Grylls",
    "马龙・詹姆斯": "Marlon James",
    "苏珊・怀斯・鲍尔": "Susan Wise Bauer",
    "安东尼・霍洛维茨": "Anthony Horowitz",
    "西蒙・沙玛": "Simon Schama",
    "罗伯特・瑟维斯": "Robert Service",
    "亚当・图兹": "Adam Tooze",
    "卡洛・金茨堡": "Carlo Ginzburg",
    "柴纳・米耶维": "China Miéville",
    "斯蒂芬・格林布拉特": "Stephen Greenblatt",
    "瑞安・霍利迪": "Ryan Holiday",
    "芭芭拉・艾伦瑞克": "Barbara Ehrenreich",
    "埃克哈特・托利": "Eckhart Tolle",
    "朱利安・阿桑奇": "Julian Assange",
    "李・斯莫林": "Lee Smolin",
    "迈克尔・翁达杰": "Michael Ondaatje",
    "米奇・阿尔博姆": "Mitch Albom",
    "卡尔・古斯塔夫・荣格": "Carl Gustav Jung",
    "所罗门・诺瑟普": "Solomon Northup",
    "大卫・哈维": "David Harvey",
    "查尔斯・都希格": "Charles Duhigg",
    "威廉・曼彻斯特": "William Manchester",
    "詹姆斯・米切纳": "James A. Michener",
    "阿斯沃斯・达摩达兰": "Aswath Damodaran",
    "尼尔・麦格雷戈": "Neil MacGregor",
    "塞巴斯蒂安·哈夫纳": "Sebastian Haffner",
    "克莱・舍基": "Clay Shirky",
    "罗杰・泽拉兹尼": "Roger Zelazny",
    "马丁・林斯特龙": "Martin Lindstrom",
    "埃里克・安布勒": "Eric Ambler",
    "彼得・戴曼迪斯": "Peter H. Diamandis",
    "菲利帕・佩里": "Philippa Perry",
    "贾尔斯・米尔顿": "Giles Milton",
    "尤金・罗根": "Eugene Rogan",
    "爱德华・哈洛韦尔": "Edward Hallowell",
    "萨曼塔・施维伯林": "Samanta Schweblin",
    "劳伦斯・赖特": "Lawrence Wright",
    "埃里克・杰・多林": "Eric Jay Dolin",
    "约翰・达尔文": "John Darwin",
    "多米尼克・利芬": "Dominic Lieven",
    "马克・彭德格拉斯特": "Mark Pendergrast",
    "乔舒亚・贝克尔": "Joshua Becker",
    "乔纳・伯杰": "Jonah Berger",
    "丹尼尔・科伊尔": "Daniel Coyle",
    "赫伯特・比克斯": "Herbert P. Bix",
    "弗里茨・斯特恩": "Fritz Stern",
    "凯莱布・沙夫": "Caleb Scharf",
    "亚历克斯・索勇－金・庞": "Alex Soojung-Kim Pang",
    "多米尼克・奥布莱恩": "Dominic O'Brien",
    "爱德华・布鲁克-海钦": "Edward Brooke-Hitching",
    "约翰・朱利叶斯・诺威奇": "John Julius Norwich",
    "丹・米尔曼": "Dan Millman",
    "德斯蒙德・苏厄德": "Desmond Seward",
    "阿尔贝托・安杰拉": "Alberto Angela",
    "苏・布莱克": "Sue Black",
    "阿利斯泰尔・霍恩": "Alistair Horne",
    "科林・伍达德": "Colin Woodard",
    "马歇尔・古德史密斯": "Marshall Goldsmith",
    "凯尔泰斯・伊姆莱": "Imre Kertész",
    "米歇尔・渥克": "Michele Wucker",
    "罗伯特・赖特": "Robert Wright",
    "本・斯泰尔": "Benn Steil",
    "彼得·海斯勒": "Peter Hessler",
    "马丁·福勒(Martin Fowler)": "Martin Fowler",
    "罗兰·米勒 (Rowland S. Miller)": "Rowland S. Miller"
  };

  function authorLabel(name) {
    var text = name ? String(name).trim() : "";
    if (!text) return t("unknownAuthor");
    if (Object.prototype.hasOwnProperty.call(AUTHOR_ZH, text)) return AUTHOR_ZH[text];
    if (currentLang === "zh-CN") {
      if (Object.prototype.hasOwnProperty.call(AUTHOR_ZH_FOREIGN, text)) return AUTHOR_ZH_FOREIGN[text];
      return text;
    }
    if (text === "佚名") return "Anonymous";
    if (Object.prototype.hasOwnProperty.call(AUTHOR_EN, text)) return AUTHOR_EN[text];
    return text;
  }

  function classicDisplay(book) {
    if (currentLang === "zh-CN" || !book) return null;
    var stored = book.t ? String(book.t).trim() : "";
    var storedZh = book.zh ? String(book.zh).trim() : "";
    if (stored && Object.prototype.hasOwnProperty.call(TITLE_EN, stored)) {
      return { heading: TITLE_EN[stored], subtitle: stored };
    }
    if (storedZh && Object.prototype.hasOwnProperty.call(TITLE_EN, storedZh)) {
      return {
        heading: stored && stored !== storedZh ? stored : TITLE_EN[storedZh],
        subtitle: storedZh
      };
    }
    return null;
  }

  function cardHeading(book) {
    var classic = classicDisplay(book);
    var englishTitle = book.t || book.f || t("untitled");
    var zhTitle = chineseTitle(book);
    if (classic) return { primary: classic.heading, secondary: classic.subtitle };
    if (zhTitle) return { primary: zhTitle, secondary: englishTitle };
    return { primary: englishTitle, secondary: "" };
  }

  function readLang() {
    try {
      var saved = localStorage.getItem(LANG_KEY);
      if (saved === "en" || saved === "zh-CN") return saved;
    } catch (err) {}
    return "zh-CN";
  }

  function fillText(selector, attr, write) {
    var nodes = document.querySelectorAll(selector);
    for (var i = 0; i < nodes.length; i += 1) {
      var key = nodes[i].getAttribute(attr);
      if (!key) continue;
      write(nodes[i], t(key));
    }
  }

  function applyFooter() {
    var el = document.getElementById("footer-line");
    if (!el) return;
    var count = el.getAttribute("data-book-count") || "";
    el.textContent = t("footerLine").replace("{count}", count);
  }

  function applyLanguage(lang, persist) {
    currentLang = lang === "zh-CN" ? "zh-CN" : "en";
    document.documentElement.lang = currentLang;
    document.documentElement.setAttribute("data-lang", currentLang === "zh-CN" ? "zh" : "en");
    if (persist) {
      try {
        localStorage.setItem(LANG_KEY, currentLang);
      } catch (err) {}
    }
    document.title = t("docTitle");
    var metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute("content", t("metaDescription"));
    fillText("[data-i18n]", "data-i18n", function (node, text) {
      if (node.classList.contains("brand")) {
        var mark = node.querySelector(".brand-mark");
        node.textContent = text;
        if (mark) node.insertBefore(mark, node.firstChild);
        return;
      }
      node.textContent = text;
    });
    applyCountLabels();
    fillText("[data-i18n-placeholder]", "data-i18n-placeholder", function (node, text) {
      node.setAttribute("placeholder", text);
    });
    fillText("[data-i18n-aria]", "data-i18n-aria", function (node, text) {
      node.setAttribute("aria-label", text);
    });
    fillText("[data-i18n-title]", "data-i18n-title", function (node, text) {
      node.setAttribute("title", text);
    });
    applyFooter();
    var langButtons = document.querySelectorAll(".lang-btn");
    for (var i = 0; i < langButtons.length; i += 1) {
      var on = langButtons[i].getAttribute("data-lang") === currentLang;
      langButtons[i].setAttribute("aria-pressed", on ? "true" : "false");
    }
    if (typeof applyTheme === "function") applyTheme(currentTheme(), false);
    if (state.ready) {
      refreshChips();
      applyFolderLinks();
      render(true);
    }
    document.documentElement.removeAttribute("data-i18n-pending");
    syncNarrowHeader();
  }

  // 窄屏：标题能居中就居中；会和右侧按钮重叠时改为两端对齐。
  function syncNarrowHeader() {
    var bar = document.querySelector(".topbar-inner");
    if (!bar) return;
    var brand = bar.querySelector(".brand");
    var tools = bar.querySelector(".header-tools");
    if (!brand || !tools) return;
    bar.classList.remove("is-packed");
    bar.classList.remove("is-tight");
    bar.classList.remove("is-min");
    if (!window.matchMedia("(max-width: 720px)").matches) return;
    var title = brand.getBoundingClientRect();
    var controls = tools.getBoundingClientRect();
    var row = bar.getBoundingClientRect();
    var titleMid = (title.left + title.right) / 2;
    var rowMid = (row.left + row.right) / 2;
    var collides =
      title.right > controls.left - 8 || Math.abs(titleMid - rowMid) > 2;
    if (!collides) return;
    bar.classList.add("is-packed");
    if (headerSpills(brand, tools)) bar.classList.add("is-tight");
    if (headerSpills(brand, tools)) bar.classList.add("is-min");
  }

  function headerSpills(brand, tools) {
    var title = brand.getBoundingClientRect();
    var controls = tools.getBoundingClientRect();
    var viewRight = document.documentElement.clientWidth;
    return title.right > controls.left - 4 || controls.right > viewRight - 1;
  }

  var libraryTotal = 0;
  var homeBooks = [];
  var shardCache = Object.create(null);
  var shardPromises = Object.create(null);
  var booksById = Object.create(null);
  var catalogBooks = [];
  var catalogKeys = Object.create(null);
  var homeKeys = Object.create(null);
  var querySeq = 0;
  var collator = null;
  try {
    if (typeof Intl !== "undefined" && Intl.Collator) {
      collator = new Intl.Collator("zh-Hans-CN", { numeric: true, sensitivity: "base" });
    }
  } catch (err) {
    collator = null;
  }

  var dom = {
    q: document.getElementById("q"),
    grid: document.getElementById("grid"),
    loading: document.getElementById("loading"),
    countLead: document.getElementById("count-lead"),
    countTotal: document.getElementById("count-total"),
    countMid: document.getElementById("count-mid"),
    countFilteredLead: document.getElementById("count-filtered-lead"),
    countFiltered: document.getElementById("count-filtered"),
    countTail: document.getElementById("count-tail"),
    empty: document.getElementById("empty"),
    emptyTitle: document.getElementById("empty-title"),
    emptyHint: document.getElementById("empty-hint"),
    emptyReset: document.getElementById("empty-reset"),
    loadMore: document.getElementById("load-more"),
    sort: document.getElementById("sort"),
    onlyDownloadable: document.getElementById("only-downloadable"),
    clearFilters: document.getElementById("clear-filters"),
    filterCount: document.getElementById("filter-count"),
    categoryChips: document.getElementById("filter-categories"),
    folderLinksGroup: document.getElementById("folder-links-group"),
    folderLinks: document.getElementById("folder-links"),
    rootLink: document.getElementById("root-link"),
    toTop: document.getElementById("to-top"),
    statBooks: document.getElementById("stat-books"),
    statCategories: document.getElementById("stat-categories"),
    statFormats: document.getElementById("stat-formats"),
    statSize: document.getElementById("stat-size"),
    toast: document.getElementById("toast"),
    themeToggle: document.getElementById("theme-toggle")
  };

  var state = {
    ready: false,
    loadError: false,
    tokens: [],
    categories: new Set(),
    onlyDownloadable: false,
    sort: "recommended",
    results: [],
    visible: 0
  };

  var chipCounts = { categories: [] };
  var toastTimer = null;
  var debounceTimer = null;

  // ==================================================================
  // 数据加载：先绘制推荐书，再按册数从小到大逐个载入分类分片
  // ==================================================================
  function normalizeBook(row) {
    if (!row || typeof row !== "object") return null;
    if (Object.prototype.hasOwnProperty.call(row, "title")) {
      return {
        id: row.id,
        t: row.title || "",
        zh: row.title_zh || "",
        a: row.author || "",
        c: row.category || "",
        s: row.subcategory || "",
        e: row.ext || "",
        z: row.size || 0,
        f: row.filename || "",
        k: row.tags || "",
        l: row.language || "",
        u: row.link || "",
        pw: row.password || "",
        fl: row.scope === "folder" ? 1 : 0,
        p: row.uploaded_at || 0
      };
    }
    return row;
  }

  function indexBook(b) {
    var title = b.t ? String(b.t) : "";
    var titleZh = b.zh ? String(b.zh) : "";
    var author = b.a ? String(b.a) : "";
    var category = (b.c || "") + "\n" + (b.s || "");
    var rest = (b.k || "") + "\n" + (b.f || "");
    b._title = (title + "\n" + titleZh).toLowerCase();
    b._author = author.toLowerCase();
    b._category = category.toLowerCase();
    b._rest = rest.toLowerCase();
    b._hay = [b._title, b._author, b._category, b._rest].join("\n");
  }

  function rememberBook(book) {
    if (book && book.id != null && book.id !== "") booksById[book.id] = book;
  }

  function adoptList(raw) {
    var out = [];
    if (!Array.isArray(raw)) return out;
    for (var i = 0; i < raw.length; i += 1) {
      var book = normalizeBook(raw[i]);
      if (!book || !(book.t || book.f)) continue;
      indexBook(book);
      rememberBook(book);
      out.push(book);
    }
    return out;
  }

  function adoptCategories(doc) {
    var rows = doc && Array.isArray(doc.categories) ? doc.categories : [];
    var list = [];
    var sum = 0;
    for (var i = 0; i < rows.length; i += 1) {
      var row = rows[i] || {};
      var name = row.name || row.key || "未分类";
      var count = Number(row.count) || 0;
      sum += count;
      list.push({ key: name, count: count });
    }
    chipCounts.categories = list;
    libraryTotal = Number(doc && doc.total) || sum;
    buildChipCounts();
  }

  function isFilePage() {
    return typeof location !== "undefined" && location.protocol === "file:";
  }

  function fetchJson(url) {
    return window.fetch(url).then(function (response) {
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response.json();
    });
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = src;
      script.onload = function () {
        resolve();
      };
      script.onerror = function () {
        reject(new Error("script failed"));
      };
      document.body.appendChild(script);
    });
  }

  function loadCatalog(url, read) {
    if (!isFilePage()) return fetchJson(url);
    return loadScript(url.replace(/\.json$/, ".js")).then(function () {
      var data = read();
      if (data == null) throw new Error("catalog missing");
      return data;
    });
  }

  function shardUrl(category) {
    return "data/books/" + encodeURI(category) + ".json";
  }

  function loadShard(category) {
    if (Object.prototype.hasOwnProperty.call(shardCache, category)) {
      return Promise.resolve(shardCache[category]);
    }
    if (shardPromises[category]) return shardPromises[category];
    var promise = loadCatalog(shardUrl(category), function () {
      return window.EBOOK_SHARDS && window.EBOOK_SHARDS[category];
    }).then(function (data) {
      if (!Array.isArray(data)) throw new Error("shard is not an array");
      var books = adoptList(data);
      shardCache[category] = books;
      if (absorbShard(books)) {
        try {
          onCatalogGrew();
        } catch (err) {
          if (window.console && console.error) console.error(err);
        }
      }
      return books;
    });
    promise = promise.catch(function (error) {
      delete shardPromises[category];
      throw error;
    });
    shardPromises[category] = promise;
    return promise;
  }

  function bookKey(book) {
    if (!book) return "row:";
    if (book.id != null && book.id !== "") return "id:" + book.id;
    return "row:" + (book.f || "") + "\n" + (book.t || "") + "\n" + (book.c || "") + "\n" + (book.a || "");
  }

  function rememberCatalogBook(book) {
    if (!book) return false;
    var key = bookKey(book);
    if (catalogKeys[key]) return false;
    catalogKeys[key] = true;
    catalogBooks.push(book);
    return true;
  }

  function seedCatalog(books) {
    catalogBooks = [];
    catalogKeys = Object.create(null);
    homeKeys = Object.create(null);
    for (var i = 0; i < books.length; i += 1) {
      if (!rememberCatalogBook(books[i])) continue;
      homeKeys[bookKey(books[i])] = true;
    }
  }

  function absorbShard(books) {
    var added = false;
    for (var i = 0; i < books.length; i += 1) {
      if (rememberCatalogBook(books[i])) added = true;
    }
    return added;
  }

  function categoriesSmallestFirst() {
    var list = chipCounts.categories.slice();
    list.sort(function (a, b) {
      if (a.count !== b.count) return a.count - b.count;
      if (collator) return collator.compare(a.key, b.key);
      if (a.key < b.key) return -1;
      if (a.key > b.key) return 1;
      return 0;
    });
    return list;
  }

  // 一次只取一个分类。上一个响应结束后才开始下一个，避免同时打出全部分片。
  function preloadCategoryShards() {
    var order = categoriesSmallestFirst();
    var index = 0;
    function step() {
      if (index >= order.length) return;
      var name = order[index].key;
      index += 1;
      loadShard(name).then(step, function (error) {
        if (window.console && console.error) console.error(error);
        step();
      });
    }
    step();
  }

  function entryMatches(entry, tokens) {
    for (var i = 0; i < tokens.length; i += 1) {
      if (!entry._hay || entry._hay.indexOf(tokens[i]) === -1) return false;
    }
    return true;
  }

  function loadData() {
    if (!isFilePage() && typeof window.fetch !== "function") {
      showLoadError(new Error("fetch unavailable"));
      return;
    }
    Promise.all([
      loadCatalog("data/home.json", function () {
        return window.EBOOK_HOME;
      }),
      loadCatalog("data/categories.json", function () {
        return window.EBOOK_CATEGORIES;
      })
    ])
      .then(function (pair) {
        var home = pair[0];
        if (!Array.isArray(home)) throw new Error("home catalog is not an array");
        homeBooks = adoptList(home);
        seedCatalog(homeBooks);
        adoptCategories(pair[1]);
        afterDataLoaded("data/home.json");
        preloadCategoryShards();
      })
      .catch(showLoadError);
  }

  function afterDataLoaded(source) {
    if (dom.loading) dom.loading.hidden = true;
    state.loadError = false;
    refreshChips();
    applyFolderLinks();
    updateStats();
    state.ready = true;
    render(true);
    if (window.console && console.info) {
      console.info(
        "ebook-vault：已载入推荐 " + homeBooks.length + " 本，书库共 " + libraryTotal + " 本（" + source + "）"
      );
    }
  }

  function showLoadError(error) {
    if (dom.loading) dom.loading.hidden = true;
    if (dom.emptyReset) dom.emptyReset.hidden = true;
    state.loadError = true;
    state.ready = true;
    state.results = [];
    state.visible = 0;
    if (dom.grid) dom.grid.textContent = "";
    paintPage();
    if (window.console && console.error) console.error(error);
  }

  function categoryOf(book) {
    return book.c || "未分类";
  }

  function formatOf(book) {
    return book.e ? String(book.e).toLowerCase() : "unknown";
  }

  function languageOf(book) {
    var code = String(book.l || book.language || "").toUpperCase();
    if (code === "ZH" || code === "中文") return "ZH";
    if (code === "EN" || code === "英文") return "EN";
    if (code === "OTHER" || code === "其他") return "OTHER";
    // 旧数据没有语言字段时的兜底：精选论文保持英文，不看中文译名。
    if ((book.c || "") === "精选论文") return "EN";
    var title = String(book.t || "");
    var cjk = (title.match(/[\u4e00-\u9fff]/g) || []).length;
    if (cjk >= 2) return "ZH";
    return "EN";
  }

  function languageLabel(code) {
    if (code === "ZH") return t("langZh");
    if (code === "OTHER") return t("langOther");
    return t("langEn");
  }

  // 分类 -> 图标 / 主色（用于分类卡片与书籍封面占位）
  var CATEGORY_META = {
    "编程开发": { icon: "💻", c1: "#475569", c2: "#64748b" },
    "统计与数据科学": { icon: "📊", c1: "#0e7490", c2: "#0f766e" },
    "教材教辅": { icon: "🎓", c1: "#b45309", c2: "#d97706" },
    "历史与社会": { icon: "🏛️", c1: "#92400e", c2: "#b45309" },
    "人文社科": { icon: "🧠", c1: "#7c2d12", c2: "#9a3412" },
    "中国古典文学": { icon: "📜", c1: "#713f12", c2: "#a16207" },
    "中国现当代文学": { icon: "📖", c1: "#9f1239", c2: "#be123c" },
    "世界文学": { icon: "🌏", c1: "#1e3a8a", c2: "#2563eb" },
    "世界文学·小说": { icon: "📕", c1: "#1e40af", c2: "#2563eb" },
    "世界文学·诗歌": { icon: "🪶", c1: "#5b21b6", c2: "#7c3aed" },
    "世界文学·戏剧": { icon: "🎭", c1: "#7c2d12", c2: "#9a3412" },
    "世界文学·散文": { icon: "✒️", c1: "#854d0e", c2: "#a16207" },
    "世界文学·儿童": { icon: "🧸", c1: "#0369a1", c2: "#0284c7" },
    "世界文学·传记": { icon: "🖋️", c1: "#7f1d1d", c2: "#991b1b" },
    "世界文学·历史": { icon: "🏛️", c1: "#92400e", c2: "#b45309" },
    "世界文学·科普": { icon: "🔭", c1: "#075985", c2: "#0369a1" },
    "世界文学·人文": { icon: "🧭", c1: "#334155", c2: "#475569" },
    "诗歌散文": { icon: "🪶", c1: "#5b21b6", c2: "#7c3aed" },
    "文学阅读": { icon: "📖", c1: "#9f1239", c2: "#be123c" },
    "悬疑推理": { icon: "🕵️", c1: "#3f3f46", c2: "#52525b" },
    "科幻奇幻": { icon: "🚀", c1: "#312e81", c2: "#4338ca" },
    "经济管理": { icon: "💼", c1: "#166534", c2: "#15803d" },
    "心理励志": { icon: "🌱", c1: "#a16207", c2: "#ca8a04" },
    "科技科普": { icon: "🔬", c1: "#075985", c2: "#0369a1" },
    "传记纪实": { icon: "🖋️", c1: "#7f1d1d", c2: "#991b1b" },
    "艺术生活": { icon: "🎨", c1: "#9d174d", c2: "#be185d" },
    "生活健康": { icon: "🍵", c1: "#3f6212", c2: "#4d7c0f" },
    "少儿教育": { icon: "🧸", c1: "#0369a1", c2: "#0284c7" },
    "综合百科": { icon: "🧭", c1: "#1e3a5f", c2: "#2f5d7c" },
    "精选论文": { icon: "📑", c1: "#3730a3", c2: "#4f46e5" },
    "在线教程文档": { icon: "🌐", c1: "#475569", c2: "#64748b" },
    "出版合集": { icon: "🗂️", c1: "#065f46", c2: "#059669" }
  };

  function categoryMeta(category) {
    return (
      CATEGORY_META[category] || { icon: "📚", c1: "#64748b", c2: "#94a3b8" }
    );
  }

  function chineseTitle(book) {
    // 英文界面标题保持英文；只有简体中文才把中文名当作主标题。
    if (currentLang !== "zh-CN") return "";
    var zh = book.zh ? String(book.zh).trim() : "";
    var en = book.t ? String(book.t).trim() : "";
    if (zh && zh !== en) return zh;
    return "";
  }

  function sortTitle(book) {
    return chineseTitle(book) || String(book.t || "");
  }

  function coverText(book) {
    // 书脊只展示分类。没有分类时留空，不再截取书名前两个字。
    var category = book.c ? String(book.c).trim() : "";
    if (!category) return "";
    // 不换行连字符，避免 Self-Help / Sci-Fi 从连字符处拆到下一列。
    return categoryLabel(category).replace(/-/g, "\u2011");
  }

  // ==================================================================
  // 筛选 / 排序
  // ==================================================================
  var SORT_OK = {
    recommended: true,
    relevance: true,
    title: true,
    size: true
  };

  function normalizeSort(value) {
    return SORT_OK[value] ? value : "recommended";
  }

  function readStoredSort() {
    try {
      return localStorage.getItem("ebook-vault-sort") || "";
    } catch (err) {
      return "";
    }
  }

  function settleSort() {
    var stored = readStoredSort();
    var current = dom.sort ? dom.sort.value : state.sort;
    var next = stored ? normalizeSort(stored) : normalizeSort(current);
    state.sort = next;
    if (dom.sort && dom.sort.value !== next) dom.sort.value = next;
  }

  // 推荐置顶：有下载链接的文学著作与科普交替排在最前，每部只留一本。
  // 文学含中国古典文学、中国现当代文学、外国文学、诗歌散文（以及尚未拆开的文学阅读）。
  // 科普为科技科普，或书名明确的科普名著（综合百科 / 人文社科）。
  var LITERATURE_CATS = {
    "文学阅读": true,
    "中国古典文学": true,
    "中国现当代文学": true,
    "外国文学": true,
    "诗歌散文": true
  };
  // 没有链接的不置顶。其余仍按可下载、中文书名、书名排序。
  var LITERATURE_PINS = [
    "红楼梦",
    "西游记",
    "水浒传",
    "三国演义",
    "楚辞",
    "论语",
    "孟子",
    "老子",
    "唐诗三百首",
    "宋词三百首",
    "古文观止",
    "野草",
    "朝花夕拾",
    "聊斋志异",
    "儒林外史",
    "西厢记",
    "牡丹亭",
    "围城"
  ];
  var SCIENCE_PINS = [
    "别逗了，费曼先生",
    "人类简史：从动物到上帝",
    "上帝掷骰子吗？量子物理史话",
    "给忙碌者的天体物理学",
    "寂静的春天（四师推荐精装版）",
    "基因传",
    "生命是什么：活细胞的物理观",
    "数学之美",
    "枪炮、病菌与钢铁 : 人类社会的命运 (世纪人文系列丛书·开放人文)",
    "天演论",
    "几何原本",
    "梦溪笔谈",
    "天工开物",
    "病毒星球",
    "细胞生命的礼赞",
    "未来简史",
    "浪潮之巅",
    "十问：霍金沉思录"
  ];

  var RECOMMENDED_PIN_RANK = {};
  var RECOMMENDED_PIN_KIND = {};
  var pinSlots = Math.max(LITERATURE_PINS.length, SCIENCE_PINS.length);
  var pinRank = 1;
  for (var pinSlot = 0; pinSlot < pinSlots; pinSlot += 1) {
    if (pinSlot < LITERATURE_PINS.length) {
      RECOMMENDED_PIN_RANK[LITERATURE_PINS[pinSlot]] = pinRank;
      RECOMMENDED_PIN_KIND[LITERATURE_PINS[pinSlot]] = "lit";
      pinRank += 1;
    }
    if (pinSlot < SCIENCE_PINS.length) {
      RECOMMENDED_PIN_RANK[SCIENCE_PINS[pinSlot]] = pinRank;
      RECOMMENDED_PIN_KIND[SCIENCE_PINS[pinSlot]] = "sci";
      pinRank += 1;
    }
  }

  function recommendedPinMatch(book) {
    if (!book || !book.u) return null;
    if (languageOf(book) !== "ZH") return null;
    var title = String(book.t || "").trim();
    var titleZh = String(book.zh || "").trim();
    var key = RECOMMENDED_PIN_RANK[title] ? title : "";
    if (!key && titleZh && RECOMMENDED_PIN_RANK[titleZh]) key = titleZh;
    if (!key) return null;
    var kind = RECOMMENDED_PIN_KIND[key];
    var cat = categoryOf(book);
    if (kind === "lit" && !LITERATURE_CATS[cat]) return null;
    if (
      kind === "sci" &&
      cat !== "科技科普" &&
      cat !== "综合百科" &&
      cat !== "人文社科"
    ) {
      return null;
    }
    return { key: key, rank: RECOMMENDED_PIN_RANK[key] };
  }

  function sortBooks(list) {
    state.sort = normalizeSort(state.sort);
    if (dom.sort && dom.sort.value !== state.sort) dom.sort.value = state.sort;
    if (state.sort === "recommended") {
      // 推荐：文学与科普交替置顶（仅有链接的一本）；其余仍按可下载、中文书名、书名排序
      var cjk = /[\u4e00-\u9fff]/;
      var pinned = new Map();
      var usedPin = {};
      for (var pinI = 0; pinI < list.length; pinI += 1) {
        var pinMatch = recommendedPinMatch(list[pinI]);
        if (!pinMatch || usedPin[pinMatch.key]) continue;
        usedPin[pinMatch.key] = true;
        pinned.set(list[pinI], pinMatch.rank);
      }
      list.sort(function (a, b) {
        var pa = pinned.get(a) || 0;
        var pb = pinned.get(b) || 0;
        if (pa !== pb) {
          if (!pa) return 1;
          if (!pb) return -1;
          return pa - pb;
        }
        var ua = a.u ? 1 : 0;
        var ub = b.u ? 1 : 0;
        if (ua !== ub) return ub - ua;
        var ca = cjk.test(sortTitle(a)) ? 1 : 0;
        var cb = cjk.test(sortTitle(b)) ? 1 : 0;
        if (ca !== cb) return cb - ca;
        var x = sortTitle(a);
        var y = sortTitle(b);
        if (collator) return collator.compare(x, y);
        return x < y ? -1 : x > y ? 1 : 0;
      });
      return;
    }
    if (state.sort === "title") {
      list.sort(function (a, b) {
        var x = sortTitle(a);
        var y = sortTitle(b);
        if (collator) return collator.compare(x, y);
        return x < y ? -1 : x > y ? 1 : 0;
      });
      return;
    }
    if (state.sort === "size") {
      list.sort(function (a, b) {
        return (Number(b.z) || 0) - (Number(a.z) || 0);
      });
      return;
    }
    // 相关度：标题命中权重最高，其次作者、分类、标签/文件名
    if (!state.tokens.length) return;
    var scores = new Map();
    for (var i = 0; i < list.length; i += 1) {
      var book = list[i];
      var score = 0;
      for (var j = 0; j < state.tokens.length; j += 1) {
        var token = state.tokens[j];
        if (book._title.indexOf(token) !== -1) score += 8;
        else if (book._author.indexOf(token) !== -1) score += 4;
        else if (book._category.indexOf(token) !== -1) score += 2;
        else score += 1;
      }
      scores.set(book, score);
    }
    list.sort(function (a, b) {
      return (scores.get(b) || 0) - (scores.get(a) || 0);
    });
  }

  function applyLocalFilters(list, keepHomeOrder) {
    var out = [];
    for (var i = 0; i < list.length; i += 1) {
      if (state.onlyDownloadable && !list[i].u) continue;
      out.push(list[i]);
    }
    if (keepHomeOrder && state.sort === "recommended") return out;
    sortBooks(out);
    return out;
  }

  // ==================================================================
  // 格式化
  // ==================================================================
  function formatSize(bytes) {
    var num = Number(bytes) || 0;
    var units = ["B", "KB", "MB", "GB", "TB"];
    for (var i = 0; i < units.length; i += 1) {
      if (Math.abs(num) < 1024 || i === units.length - 1) {
        if (i === 0) return Math.round(num) + "B";
        return (Math.round(num * 10) / 10).toFixed(1) + units[i];
      }
      num /= 1024;
    }
    return "0B";
  }

  function formatSummary(counts, limit) {
    var entries = [];
    if (counts instanceof Map) {
      counts.forEach(function (count, key) {
        entries.push([key, count]);
      });
    } else {
      for (var key in counts) {
        if (Object.prototype.hasOwnProperty.call(counts, key)) entries.push([key, counts[key]]);
      }
    }
    entries.sort(function (a, b) {
      return b[1] - a[1] || (collator ? collator.compare(a[0], b[0]) : a[0] < b[0] ? -1 : 1);
    });
    if (!entries.length) return "—";
    var shown = entries.slice(0, limit).map(function (entry) {
      return String(entry[0]).toUpperCase();
    });
    if (entries.length > limit) {
      return shown.join(" · ") + " 等 " + entries.length + " 种";
    }
    return shown.join(" · ");
  }

  // ==================================================================
  // 渲染：统计概览
  // ==================================================================
  function updateStats() {
    if (dom.statBooks) dom.statBooks.textContent = libraryTotal.toLocaleString();
    if (dom.statCategories) dom.statCategories.textContent = String(chipCounts.categories.length);
  }

  function applyFolderLinks() {
    var CATEGORY_LINKS = window.CATEGORY_LINKS || {};
    var ROOT_LINK = window.ROOT_LINK || "";
    if (dom.rootLink) {
      if (ROOT_LINK) {
        dom.rootLink.href = ROOT_LINK;
        dom.rootLink.hidden = false;
      } else {
        dom.rootLink.hidden = true;
      }
    }

    // 侧栏「合集下载」：列出配置了分类文件夹链接的分类
    if (!dom.folderLinks || !dom.folderLinksGroup) return;
    var categories = Object.keys(CATEGORY_LINKS);
    if (!categories.length) {
      dom.folderLinksGroup.hidden = true;
      return;
    }
    var counts = {};
    for (var i = 0; i < chipCounts.categories.length; i += 1) {
      counts[chipCounts.categories[i].key] = chipCounts.categories[i].count;
    }
    categories.sort(function (a, b) {
      return (counts[b] || 0) - (counts[a] || 0);
    });
    dom.folderLinks.textContent = "";
    for (var j = 0; j < categories.length; j += 1) {
      var category = categories[j];
      var anchor = document.createElement("a");
      anchor.className = "folder-link";
      anchor.href = CATEGORY_LINKS[category];
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.title = t("folderLinkTitle").replace("{name}", categoryLabel(category));
      var label = document.createElement("span");
      label.className = "folder-link-name";
      label.textContent = categoryLabel(category);
      var badge = document.createElement("span");
      badge.className = "folder-link-badge";
      badge.textContent = t("folderBadge");
      anchor.appendChild(label);
      anchor.appendChild(badge);
      dom.folderLinks.appendChild(anchor);
    }
    dom.folderLinksGroup.hidden = false;
  }
  function highlightInto(el, text, tokens) {
    if (!tokens.length) {
      el.textContent = text;
      return;
    }
    var lower = text.toLowerCase();
    var ranges = [];
    for (var i = 0; i < tokens.length; i += 1) {
      var token = tokens[i];
      if (!token) continue;
      var from = 0;
      var idx;
      while ((idx = lower.indexOf(token, from)) !== -1) {
        ranges.push([idx, idx + token.length]);
        from = idx + token.length;
      }
    }
    if (!ranges.length) {
      el.textContent = text;
      return;
    }
    ranges.sort(function (a, b) {
      return a[0] - b[0] || a[1] - b[1];
    });
    var merged = [];
    for (var j = 0; j < ranges.length; j += 1) {
      var range = ranges[j];
      var last = merged[merged.length - 1];
      if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
      else merged.push([range[0], range[1]]);
    }
    var pos = 0;
    for (var k = 0; k < merged.length; k += 1) {
      var start = merged[k][0];
      var end = merged[k][1];
      if (start > pos) el.appendChild(document.createTextNode(text.slice(pos, start)));
      var mark = document.createElement("mark");
      mark.textContent = text.slice(start, end);
      el.appendChild(mark);
      pos = end;
    }
    if (pos < text.length) el.appendChild(document.createTextNode(text.slice(pos)));
  }

  function makeBadge(text, className) {
    var span = document.createElement("span");
    span.className = "badge " + className;
    span.textContent = text;
    return span;
  }

  function buildCard(book) {
    var downloadable = !!book.u;
    var folderLevel = !!book.fl;
    var names = cardHeading(book);
    var card = document.createElement("article");
    card.className = "card";
    if (downloadable) {
      card.className += " is-downloadable";
      card.dataset.url = book.u;
      card.tabIndex = 0;
      card.setAttribute("role", "link");
      card.setAttribute(
        "aria-label",
        (folderLevel ? t("ariaCollection") : t("ariaDownload")) +
          names.primary +
          (names.secondary ? " " + names.secondary : "")
      );
    }

    // 卡片上半部分：封面占位 + 书名/标签/作者
    var top = document.createElement("div");
    top.className = "card-top";

    var meta = categoryMeta(categoryOf(book));
    card.style.setProperty("--cat-color", meta.c1);
    var cover = document.createElement("div");
    cover.className = "card-cover";
    cover.setAttribute("aria-hidden", "true");
    cover.style.setProperty("--c1", meta.c1);
    cover.style.setProperty("--c2", meta.c2);
    var spineLabel = coverText(book);
    if (spineLabel) {
      var coverSpan = document.createElement("span");
      coverSpan.textContent = spineLabel;
      cover.appendChild(coverSpan);
    }

    var main = document.createElement("div");
    main.className = "card-main";

    var title = document.createElement("h3");
    title.className = "card-title";
    title.title = names.secondary ? names.primary + "\n" + names.secondary : names.primary;
    highlightInto(title, names.primary, state.tokens);
    main.appendChild(title);
    if (names.secondary) {
      var english = document.createElement("p");
      english.className = "card-title-en";
      english.title = names.secondary;
      highlightInto(english, names.secondary, state.tokens);
      main.appendChild(english);
    }

    var bookMeta = document.createElement("p");
    bookMeta.className = "card-meta";
    var author = document.createElement("span");
    author.className = "card-author";
    author.textContent = authorLabel(book.a);
    bookMeta.appendChild(author);
    var size = document.createElement("span");
    size.className = "card-size";
    size.textContent = formatSize(book.z);
    bookMeta.appendChild(size);
    main.appendChild(bookMeta);

    var badges = document.createElement("div");
    badges.className = "badges";
    if (book.e) badges.appendChild(makeBadge(String(book.e).toUpperCase(), "fmt fmt-" + formatOf(book)));
    badges.appendChild(makeBadge(languageLabel(languageOf(book)), "badge-lang"));
    badges.appendChild(makeBadge(categoryLabel(categoryOf(book)), "badge-cat"));
    if (book.s) badges.appendChild(makeBadge(subcategoryLabel(String(book.s)), "badge-sub"));
    if (downloadable && folderLevel) badges.appendChild(makeBadge(t("badgeCollection"), "badge-sub"));
    main.appendChild(badges);

    top.appendChild(cover);
    top.appendChild(main);
    card.appendChild(top);

    var actions = document.createElement("div");
    actions.className = "card-actions";
    if (downloadable) {
      var link = document.createElement("a");
      link.className = "btn primary download";
      link.href = book.u;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = folderLevel ? t("downloadCollection") : t("download");
      if (book.pw) link.title = t("codeTitle").replace("{code}", book.pw);
      if (folderLevel) link.title = t("collectionTitle");
      actions.appendChild(link);

      var copy = document.createElement("button");
      copy.type = "button";
      copy.className = "btn copy";
      copy.textContent = t("copyLink");
      copy.dataset.url = book.u;
      copy.dataset.password = book.pw || "";
      actions.appendChild(copy);
    } else {
      var pending = document.createElement("span");
      pending.className = "btn pending";
      pending.textContent = t("pending");
      pending.setAttribute("aria-disabled", "true");
      actions.appendChild(pending);
    }
    card.appendChild(actions);
    return card;
  }

  function homeBrowse() {
    return !state.tokens.length && !state.categories.size;
  }

  function setCountPiece(node, key) {
    if (!node) return;
    node.setAttribute("data-i18n", key);
    node.textContent = t(key);
  }

  // 「已筛选」只放进 count-filtered-lead。countMid 留下前半段，避免和原文案各写一次。
  // 英文 countMid 不含这几个字，前导留空，不会多出一份标签。
  function applyCountLabels() {
    setCountPiece(dom.countLead, "countLead");
    setCountPiece(dom.countTail, "countTail");
    var mid = t("countMid");
    var mark = "已筛选";
    var at = String(mid || "").indexOf(mark);
    if (dom.countMid) {
      dom.countMid.removeAttribute("data-i18n");
      dom.countMid.textContent = at === -1 ? mid : mid.slice(0, at);
    }
    if (dom.countFilteredLead) {
      dom.countFilteredLead.textContent = at === -1 ? "" : mid.slice(at);
    }
  }

  function updateCounts(total, filtered) {
    applyCountLabels();
    if (dom.countTotal) dom.countTotal.textContent = String(total);
    if (dom.countFiltered) {
      dom.countFiltered.textContent = String(homeBrowse() ? catalogBooks.length : filtered);
    }
  }

  function paintChrome() {
    var filtered = state.results.length;
    var total = libraryTotal;
    updateCounts(total, filtered);

    var hasResults = filtered > 0;
    if (dom.empty) dom.empty.hidden = hasResults;
    if (!hasResults && dom.emptyTitle && dom.emptyHint) {
      if (state.loadError) {
        dom.emptyTitle.textContent = t("loadErrorTitle");
        var loadHint = t("loadErrorHint");
        dom.emptyHint.textContent = loadHint;
        dom.emptyHint.hidden = !loadHint;
      } else if (total) {
        dom.emptyTitle.textContent = t("emptyTitle");
        dom.emptyHint.textContent = t("emptyHint");
        dom.emptyHint.hidden = false;
      } else {
        dom.emptyTitle.textContent = t("emptyLibraryTitle");
        dom.emptyHint.textContent = t("emptyLibraryHint");
        dom.emptyHint.hidden = false;
      }
    }
    if (dom.loadMore) {
      dom.loadMore.hidden = !hasResults || state.visible >= filtered;
      if (state.visible < filtered) {
        dom.loadMore.textContent = t("loadMoreLeft").replace("{n}", String(filtered - state.visible));
      }
    }
  }

  function paintCount(count) {
    if (!dom.grid) return;
    var end = Math.min(count, state.results.length);
    if (end <= state.visible) return;
    var fragment = document.createDocumentFragment();
    for (var i = state.visible; i < end; i += 1) {
      fragment.appendChild(buildCard(state.results[i]));
    }
    dom.grid.appendChild(fragment);
    state.visible = end;
  }

  function paintPage() {
    paintCount(Math.min(state.visible + PAGE_SIZE, state.results.length));
    paintChrome();
  }

  function finishResults(seq, list) {
    if (seq !== querySeq) return;
    state.loadError = false;
    if (dom.emptyReset) dom.emptyReset.hidden = false;
    if (dom.loading) dom.loading.hidden = true;
    state.results = list;
    state.visible = 0;
    if (dom.grid) dom.grid.textContent = "";
    paintPage();
  }

  function recommendedPrefix(list) {
    var n = 0;
    while (n < list.length && homeKeys[bookKey(list[n])]) n += 1;
    return n;
  }

  // 首页先画推荐书。后面已经载入的书留在结果里，等用户点加载更多。
  function finishHomeResults(seq, list) {
    if (seq !== querySeq) return;
    state.loadError = false;
    if (dom.emptyReset) dom.emptyReset.hidden = false;
    if (dom.loading) dom.loading.hidden = true;
    state.results = list;
    state.visible = 0;
    if (dom.grid) dom.grid.textContent = "";
    paintCount(recommendedPrefix(list));
    paintChrome();
  }

  function listsSharePrefix(list, count) {
    if (count > list.length || count > state.results.length) return false;
    for (var i = 0; i < count; i += 1) {
      if (state.results[i] !== list[i]) return false;
    }
    return true;
  }

  function presentResults(list, shown) {
    var keep = shown > 0 && listsSharePrefix(list, shown);
    state.results = list;
    if (keep) {
      paintChrome();
      return;
    }
    state.visible = 0;
    if (dom.grid) dom.grid.textContent = "";
    var target = shown > 0 ? Math.min(shown, list.length) : Math.min(PAGE_SIZE, list.length);
    paintCount(target);
    paintChrome();
  }

  function extendHomeResults() {
    var seen = Object.create(null);
    for (var i = 0; i < state.results.length; i += 1) seen[bookKey(state.results[i])] = true;
    for (var j = 0; j < catalogBooks.length; j += 1) {
      var book = catalogBooks[j];
      var key = bookKey(book);
      if (seen[key]) continue;
      seen[key] = true;
      if (state.onlyDownloadable && !book.u) continue;
      state.results.push(book);
    }
  }

  function collectMatches(tokens, categories) {
    var selected = null;
    if (categories.length) {
      selected = Object.create(null);
      for (var s = 0; s < categories.length; s += 1) selected[categories[s]] = true;
    }
    var hits = [];
    for (var i = 0; i < catalogBooks.length; i += 1) {
      var book = catalogBooks[i];
      if (selected && !selected[categoryOf(book)]) continue;
      if (tokens.length && !entryMatches(book, tokens)) continue;
      hits.push(book);
    }
    return hits;
  }

  function refreshSearchResults() {
    if (!state.tokens.length || state.loadError) return;
    var seq = querySeq;
    var categories = [];
    state.categories.forEach(function (name) {
      categories.push(name);
    });
    var list = applyLocalFilters(collectMatches(state.tokens, categories), false);
    if (seq !== querySeq || state.loadError) return;
    if (dom.loading) dom.loading.hidden = true;
    presentResults(list, state.visible);
  }

  function onCatalogGrew() {
    if (!state.ready || state.loadError) return;
    if (homeBrowse()) {
      if (state.sort === "recommended") {
        extendHomeResults();
        paintChrome();
        return;
      }
      presentResults(applyLocalFilters(catalogBooks.slice(), false), state.visible);
      return;
    }
    if (state.tokens.length && !state.categories.size) refreshSearchResults();
  }

  function selectedCategoryNames() {
    var categories = [];
    state.categories.forEach(function (name) {
      categories.push(name);
    });
    return categories;
  }

  function requestResults() {
    var seq = ++querySeq;
    var tokens = state.tokens;
    var categories = selectedCategoryNames();
    applyCountLabels();
    if (!tokens.length && !categories.length) {
      var homeList = applyLocalFilters(catalogBooks.slice(), state.sort === "recommended");
      if (state.sort === "recommended") finishHomeResults(seq, homeList);
      else finishResults(seq, homeList);
      return;
    }

    if (!categories.length) {
      finishResults(seq, applyLocalFilters(collectMatches(tokens, categories), false));
      return;
    }

    var waitShard = false;
    for (var w = 0; w < categories.length; w += 1) {
      if (!Object.prototype.hasOwnProperty.call(shardCache, categories[w])) waitShard = true;
    }
    if (waitShard) {
      if (dom.loading) dom.loading.hidden = false;
      if (dom.grid) dom.grid.textContent = "";
      state.visible = 0;
    }

    Promise.all(categories.map(loadShard))
      .then(function () {
        if (seq !== querySeq) return;
        var books;
        if (tokens.length) {
          books = collectMatches(tokens, categories);
        } else {
          books = [];
          for (var c = 0; c < categories.length; c += 1) {
            var shard = shardCache[categories[c]] || [];
            for (var b = 0; b < shard.length; b += 1) books.push(shard[b]);
          }
        }
        finishResults(seq, applyLocalFilters(books, false));
      })
      .catch(function (error) {
        if (seq !== querySeq) return;
        showLoadError(error);
      });
  }

  function render(reset) {
    if (!state.ready) return;
    if (!reset) {
      paintPage();
      return;
    }
    requestResults();
  }

  function scheduleRender() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function () {
      debounceTimer = null;
      state.tokens = dom.q.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      render(true);
    }, DEBOUNCE_MS);
  }

  function renderNow() {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    state.tokens = dom.q.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    render(true);
  }

  // ==================================================================
  // 筛选 chips
  // ==================================================================
  function buildChipCounts() {
    chipCounts.categories.sort(function (a, b) {
      return b.count - a.count || (collator ? collator.compare(a.key, b.key) : a.key < b.key ? -1 : 1);
    });
  }

  function chipLeadingVisual(container, key) {
    if (container === dom.categoryChips) {
      var meta = CATEGORY_META[key];
      var icon = document.createElement("span");
      icon.className = "chip-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = meta ? meta.icon : "📚";
      return icon;
    }
    return null;
  }

  function chipColor(container, key) {
    if (container === dom.categoryChips) {
      var meta = CATEGORY_META[key];
      return meta ? meta.c1 : "";
    }
    return "";
  }

  function renderChips(container, entries, selected, labelFn) {
    if (!container) return;
    container.textContent = "";
    for (var i = 0; i < entries.length; i += 1) {
      var entry = entries[i];
      var button = document.createElement("button");
      button.type = "button";
      button.className = "chip";
      button.dataset.value = entry.key;
      var color = chipColor(container, entry.key);
      if (color) button.style.setProperty("--chip-color", color);
      button.setAttribute("aria-pressed", selected.has(entry.key) ? "true" : "false");
      if (selected.has(entry.key)) button.classList.add("active");

      var label = document.createElement("span");
      label.className = "chip-label";
      var visual = chipLeadingVisual(container, entry.key);
      if (visual) label.appendChild(visual);
      var text = document.createElement("span");
      text.className = "chip-text";
      text.textContent = labelFn(entry.key);
      label.appendChild(text);
      button.appendChild(label);

      var count = document.createElement("span");
      count.className = "chip-count";
      count.textContent = String(entry.count);
      button.appendChild(count);
      container.appendChild(button);
    }
  }

  function updateFilterChrome() {
    var active =
      state.categories.size +
      (state.onlyDownloadable ? 1 : 0);
    var hasQuery = !!(dom.q && dom.q.value && dom.q.value.trim());
    var badges = document.querySelectorAll(".filter-count");
    for (var b = 0; b < badges.length; b += 1) {
      badges[b].textContent = String(active);
      badges[b].hidden = active === 0;
    }
    // 搜索词也算“可清空”的状态，否则只输入了关键词时按钮是禁用、点了没反应
    if (dom.clearFilters) dom.clearFilters.disabled = active === 0 && !hasQuery;
  }

  function refreshChips() {
    renderChips(dom.categoryChips, chipCounts.categories, state.categories, categoryLabel);
    updateFilterChrome();
  }

  function bindChips(container, selected) {
    if (!container) return;
    container.addEventListener("click", function (event) {
      var target = event.target;
      if (!(target instanceof Element)) return;
      var button = target.closest("button.chip");
      if (!button || !container.contains(button)) return;
      var key = button.dataset.value;
      if (selected.has(key)) selected.delete(key);
      else selected.add(key);
      var active = selected.has(key);
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
      updateFilterChrome();
      render(true);
    });
  }

  // ==================================================================
  // 复制链接 / 提取码 / Toast
  // ==================================================================
  function showToast(message) {
    if (!dom.toast) return;
    dom.toast.textContent = message;
    dom.toast.hidden = false;
    dom.toast.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      dom.toast.classList.remove("show");
      dom.toast.hidden = true;
    }, 2200);
  }

  function copyViaExecCommand(text) {
    return new Promise(function (resolve, reject) {
      var area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.top = "-1000px";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      area.setSelectionRange(0, text.length);
      var ok = false;
      try {
        ok = document.execCommand("copy");
      } catch (err) {
        ok = false;
      }
      document.body.removeChild(area);
      if (ok) resolve();
      else reject(new Error("copy failed"));
    });
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () {
        return copyViaExecCommand(text);
      });
    }
    return copyViaExecCommand(text);
  }

  function copyPayload(url, password) {
    // 城通分享链接已经包含提取码（?p=xxx），复制时只复制链接本身
    return url;
  }

  function flashButton(button, doneText, normalText) {
    var original = normalText || button.textContent;
    button.textContent = doneText;
    button.disabled = true;
    setTimeout(function () {
      button.textContent = original;
      button.disabled = false;
    }, 1500);
  }

  function copyLink(url, password, button) {
    copyText(copyPayload(url, password))
      .then(function () {
        flashButton(button, t("copied"), button.textContent);
        showToast(password ? t("linkCopiedCode") : t("linkCopied"));
      })
      .catch(function () {
        showToast(t("copyFailed"));
      });
  }

  function copyPassword(password, button) {
    copyText(password)
      .then(function () {
        flashButton(button, t("codeCopiedBtn"), t("codeBtn").replace("{code}", password));
        showToast(t("codeCopiedToast").replace("{code}", password));
      })
      .catch(function () {
        showToast(t("codeCopyFailed"));
      });
  }

  // ==================================================================
  // 深色 / 浅色模式切换（右上角按钮，记忆到 localStorage）
  // ==================================================================
  var THEME_KEY = "ebook-vault-theme";

  function currentTheme() {
    var attr = document.documentElement.getAttribute("data-theme");
    return attr === "dark" ? "dark" : "light";
  }

  function applyTheme(theme, persist) {
    var dark = theme === "dark";
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    if (persist) {
      try {
        localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
      } catch (e) {
        /* 隐私模式 / 禁用存储时忽略 */
      }
    }
    if (dom.themeToggle) {
      dom.themeToggle.textContent = dark ? "☀️" : "🌙";
      var label = dark ? t("themeToLight") : t("themeToDark");
      dom.themeToggle.setAttribute("aria-label", label);
      dom.themeToggle.setAttribute("title", label);
      dom.themeToggle.setAttribute("aria-pressed", dark ? "true" : "false");
    }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#101015" : "#f8f5ee");
  }

  function bindTheme() {
    applyTheme(currentTheme(), false);
    if (dom.themeToggle) {
      dom.themeToggle.addEventListener("click", function () {
        applyTheme(currentTheme() === "dark" ? "light" : "dark", true);
      });
    }
  }

  // ==================================================================
  // 事件绑定
  // ==================================================================
  function resetAll() {
    state.categories.clear();
    state.onlyDownloadable = false;
    if (dom.onlyDownloadable) dom.onlyDownloadable.checked = false;
    if (dom.q) dom.q.value = "";
    state.tokens = [];
    refreshChips();
    render(true);
  }

  function bindBackToTop() {
    if (!dom.toTop) return;
    dom.toTop.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    var update = function () {
      var y = window.scrollY || document.documentElement.scrollTop || 0;
      dom.toTop.classList.toggle("show", y > 560);
    };
    window.addEventListener("scroll", update, { passive: true });
    update();
  }

  function bindLang() {
    var root = document.getElementById("lang-switch");
    if (!root) return;
    root.addEventListener("click", function (event) {
      var target = event.target;
      if (!(target instanceof Element)) return;
      var button = target.closest(".lang-btn");
      if (!button || !root.contains(button)) return;
      var next = button.getAttribute("data-lang") === "zh-CN" ? "zh-CN" : "en";
      if (next === currentLang) return;
      applyLanguage(next, true);
    });
  }

  function filtersOnTop() {
    return window.matchMedia("(max-width: 980px)").matches;
  }

  function focusWithoutScroll(el) {
    if (!el) return;
    try {
      el.focus({ preventScroll: true });
    } catch (err) {
      el.focus();
    }
  }

  // 只在筛选条位于顶部时打开弹窗。完成、遮罩、Esc 都只是关掉弹窗，已选条件保持生效。
  function setFiltersOpen(open, silent) {
    var root = document.getElementById("filters");
    var dialog = document.getElementById("filters-dialog");
    var opener = document.getElementById("filters-open");
    if (!root || !dialog || !opener) return;
    var top = filtersOnTop();
    if (open && !top) return;
    var was = root.classList.contains("is-open");
    if (!open && !was) return;
    root.classList.toggle("is-open", !!open);
    opener.setAttribute("aria-expanded", open ? "true" : "false");
    document.body.classList.toggle("filters-modal-open", !!open);
    if (open) {
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      if (!silent) focusWithoutScroll(dialog);
    } else {
      dialog.removeAttribute("role");
      dialog.removeAttribute("aria-modal");
      if (!silent && was && top) focusWithoutScroll(opener);
    }
  }

  function filtersPopupHandlesKey(event) {
    var root = document.getElementById("filters");
    if (!root || !root.classList.contains("is-open")) return false;
    if (event.key === "Escape") {
      event.preventDefault();
      setFiltersOpen(false);
      return true;
    }
    if (event.key !== "Tab") return false;
    var dialog = document.getElementById("filters-dialog");
    if (!dialog) return true;
    var nodes = dialog.querySelectorAll("button:not([disabled]), input, select, textarea, a[href]");
    var list = [];
    for (var i = 0; i < nodes.length; i += 1) {
      if (nodes[i].getClientRects().length) list.push(nodes[i]);
    }
    if (!list.length) return true;
    var first = list[0];
    var last = list[list.length - 1];
    var active = document.activeElement;
    if (event.shiftKey && (active === first || active === dialog)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || active === dialog)) {
      event.preventDefault();
      first.focus();
    }
    return true;
  }

  function bindFiltersPopup() {
    var opener = document.getElementById("filters-open");
    var done = document.getElementById("filters-done");
    var backdrop = document.getElementById("filters-backdrop");
    if (opener) {
      opener.addEventListener("click", function () {
        var root = document.getElementById("filters");
        setFiltersOpen(!(root && root.classList.contains("is-open")));
      });
    }
    if (done) {
      done.addEventListener("click", function () {
        setFiltersOpen(false);
      });
    }
    if (backdrop) {
      backdrop.addEventListener("click", function () {
        setFiltersOpen(false);
      });
    }
  }

  function bindEvents() {
    bindTheme();
    bindLang();
    bindFiltersPopup();
    window.addEventListener("resize", syncNarrowHeader);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        syncNarrowHeader();
      });
    }

    if (dom.q) {
      dom.q.addEventListener("input", function () {
        updateFilterChrome();
        scheduleRender();
      });
      dom.q.addEventListener("search", function () {
        updateFilterChrome();
        renderNow();
      });
    }

    if (dom.sort) {
      dom.sort.addEventListener("change", function () {
        state.sort = normalizeSort(dom.sort.value);
        if (dom.sort.value !== state.sort) dom.sort.value = state.sort;
        render(true);
      });
    }

    if (dom.onlyDownloadable) {
      dom.onlyDownloadable.addEventListener("change", function () {
        state.onlyDownloadable = dom.onlyDownloadable.checked;
        updateFilterChrome();
        render(true);
      });
    }

    if (dom.clearFilters) dom.clearFilters.addEventListener("click", resetAll);
    if (dom.emptyReset) dom.emptyReset.addEventListener("click", resetAll);

    if (dom.loadMore) {
      dom.loadMore.addEventListener("click", function () {
        render(false);
      });
    }

    if (dom.grid) {
      dom.grid.addEventListener("click", function (event) {
        var target = event.target;
        if (!(target instanceof Element)) return;
        var passwordChip = target.closest("button.password-chip");
        if (passwordChip) {
          event.preventDefault();
          event.stopPropagation();
          copyPassword(passwordChip.dataset.password, passwordChip);
          return;
        }
        var copyButton = target.closest("button.copy");
        if (copyButton) {
          event.preventDefault();
          event.stopPropagation();
          copyLink(copyButton.dataset.url, copyButton.dataset.password, copyButton);
          return;
        }
        if (target.closest("a, button")) return;
        var card = target.closest(".card");
        if (card && card.dataset.url) {
          window.open(card.dataset.url, "_blank", "noopener");
        }
      });

      dom.grid.addEventListener("keydown", function (event) {
        if (event.key !== "Enter" && event.key !== " ") return;
        var target = event.target;
        if (!(target instanceof Element)) return;
        if (target.closest("a, button")) return;
        var card = target.closest(".card");
        if (card && card.dataset.url) {
          event.preventDefault();
          window.open(card.dataset.url, "_blank", "noopener");
        }
      });
    }

    bindChips(dom.categoryChips, state.categories);
    bindBackToTop();

    document.addEventListener("keydown", function (event) {
      if (filtersPopupHandlesKey(event)) return;
      if (event.key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey) {
        var active = document.activeElement;
        var typing =
          active &&
          (active.tagName === "INPUT" ||
            active.tagName === "TEXTAREA" ||
            active.tagName === "SELECT" ||
            active.isContentEditable);
        if (!typing && dom.q) {
          event.preventDefault();
          dom.q.focus();
          dom.q.select();
        }
        return;
      }
      if (event.key === "Escape" && dom.q) {
        if (dom.q.value) {
          dom.q.value = "";
          state.tokens = [];
          renderNow();
        } else if (document.activeElement === dom.q) {
          dom.q.blur();
        }
      }
    });
  }

  // ==================================================================
  // 启动
  // ==================================================================
  // 结果栏贴在顶栏正下方。窄屏顶栏会变成两行，高度不固定，所以量真实高度。
  // 顶部筛选时册数跟在筛选按钮同一行，工具条不计入顶栏高度。
  function syncHeaderOffset() {
    var header = document.querySelector(".topbar");
    if (header) {
      var height = Math.ceil(header.getBoundingClientRect().height);
      if (height > 0) document.documentElement.style.setProperty("--header-h", height + "px");
    }
    if (!filtersOnTop()) setFiltersOpen(false, true);
  }

  function watchHeaderOffset() {
    syncHeaderOffset();
    window.addEventListener("resize", syncHeaderOffset);
    if (typeof ResizeObserver === "function") {
      var header = document.querySelector(".topbar");
      if (header) new ResizeObserver(syncHeaderOffset).observe(header);
    }
    if (window.matchMedia) {
      var query = window.matchMedia("(max-width: 980px)");
      if (query.addEventListener) query.addEventListener("change", syncHeaderOffset);
      else if (query.addListener) query.addListener(syncHeaderOffset);
    }
  }

  function init() {
    watchHeaderOffset();
    settleSort();
    applyLanguage(readLang(), false);
    bindEvents();
    loadData();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
