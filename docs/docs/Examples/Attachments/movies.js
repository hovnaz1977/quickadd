const notice = msg => new Notice(msg, 5000);
const log = msg => console.log(msg);

const API_KEY_OPTION = "OMDb API Key";
const YT_API_KEY_OPTION = "YouTube API Key";
const API_URL = "https://www.omdbapi.com/";
const IMDB_BASE_URL = "https://www.imdb.com/title/";

module.exports = {
    entry: start,
    settings: {
        name: "Movie Script",
        author: "Christian B. B. Houmann",
        options: {
            [API_KEY_OPTION]: {
                type: "text",
                defaultValue: "",
                placeholder: "OMDb API Key",
            },
            [YT_API_KEY_OPTION]: {
                type: "text",
                defaultValue: "",
                placeholder: "YouTube API Key",
            },
        }
    }
}

let QuickAdd;
let Settings;

async function start(params, settings) {
    QuickAdd = params;
    Settings = settings;

    const query = await QuickAdd.quickAddApi.inputPrompt("Enter movie title or IMDB ID: ");
    if (!query) {
        notice("No query entered.");
        throw new Error("No query entered.");
    }

    let selectedShow;

    if (isImdbId(query)) {
        selectedShow = await getByImdbId(query);
    } else {
        const results = await getByQuery(query);

        const choice = await QuickAdd.quickAddApi.suggester(results.map(formatTitleForSuggestion), results);
        if (!choice) {
            notice("No choice selected.");
            throw new Error("No choice selected.");
        }

        selectedShow = await getByImdbId(choice.imdbID);
    }

    const trailer = await getYouTubeTrailer(selectedShow.Title);

    QuickAdd.variables = {
        ...selectedShow,
        imdbUrl: IMDB_BASE_URL + selectedShow.imdbID,
        Released: formatDateString(selectedShow.Released),
        actorLinks: linkifyList(selectedShow.Actors.split(",")),
        genreLinks: linkifyList(selectedShow.Genre.split(",")),
        directorLink: linkifyList(selectedShow.Director.split(",")),
        fileName: replaceIllegalFileNameCharactersInString(selectedShow.Title),
        typeLink: `[[${selectedShow.Type === "movie" ? "Movies" : "Series"}]]`,
        languageLower: selectedShow.Language.toLowerCase(),
        trailerMarkdown: trailer ? trailer.embedMarkdown : "Trailer not found",
        trailerIframe: trailer ? trailer.embedIframe : "Trailer not found",
    };
}

function isImdbId(str) {
    return /^tt\d+$/.test(str);
}

function formatTitleForSuggestion(resultItem) {
    return `(${resultItem.Type === "movie" ? "M" : "TV"}) ${resultItem.Title} (${resultItem.Year})`;
}

function formatDateString(dateString) {
    const [day, month, year] = dateString.split(' ');
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthIndex = monthNames.indexOf(month);
    const date = new Date(year, monthIndex, day);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

async function getByQuery(query) {
    const searchResults = await apiGet(API_URL, {
        "s": query,
    });

    if (!searchResults.Search || !searchResults.Search.length) {
        notice("No results found.");
        throw new Error("No results found.");
    }

    return searchResults.Search;
}

async function getByImdbId(id) {
    const res = await apiGet(API_URL, {
        "i": id
    });

    if (!res) {
        notice("No results found.");
        throw new Error("No results found.");
    }

    return res;
}

function linkifyList(list) {
    if (list.length === 0) return "";
    return list.map(item => `\n  - "[[${item.trim()}]]"`).join("");
}

function replaceIllegalFileNameCharactersInString(string) {
    return string.replace(/[\\,#%&\{\}\/*<>$\'\":@]*/g, '');
}

async function apiGet(url, data) {
    let finalURL = new URL(url);
    if (data)
        Object.keys(data).forEach(key => finalURL.searchParams.append(key, data[key]));

    finalURL.searchParams.append("apikey", Settings[API_KEY_OPTION]);

    const res = await request({
        url: finalURL.href,
        method: 'GET',
        cache: 'no-cache',
        headers: {
            'Content-Type': 'application/json',
        },
    });

    return JSON.parse(res);
}

// YouTube Trailer Fetch
async function getYouTubeTrailer(title) {
    const searchQuery = `${title} official trailer`;
    const apiKey = Settings[YT_API_KEY_OPTION];
    if (!apiKey) {
        notice("No YouTube API key provided.");
        return null;
    }

    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=1&q=${encodeURIComponent(searchQuery)}&key=${apiKey}`;

    try {
        const res = await request({
            url,
            method: 'GET',
        });

        const json = JSON.parse(res);
        if (json.items && json.items.length > 0 && json.items[0].id.videoId) {
            const videoId = json.items[0].id.videoId;
            return {
                videoId,
                embedMarkdown: `[![Trailer](https://img.youtube.com/vi/${videoId}/0.jpg)](https://www.youtube.com/watch?v=${videoId})`,
                embedIframe: `<iframe width="560" height="315" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`
            };
        } else {
            return null;
        }
    } catch (err) {
        notice("Failed to fetch YouTube trailer.");
        log(err);
        return null;
    }
}
