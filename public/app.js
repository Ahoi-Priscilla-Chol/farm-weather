const form = document.getElementById('search-form');
const cityInput = document.getElementById('city');
const messageE1 = document.getElementById('message');
const controlsE1 = document.getElementById('controls');
const sortE1 = document.getElementById('sort');
const filterE1 = document.getElementById('filter');
const titleE1 = document.getElementById('place-title');
const resultsE1 = document.getElementById('results');
const serverE1 = document.getElementById('server-name');

let days = [];

function showMessage(text, isError) {
    messageE1.textContent = text;
    messageE1.className = isError ? 'message error' : 'message';
}

function mostCommon(items) {
    const counts = {};
    items.forEach((item) => { counts[item] = (counts[item] || 0) + 1; });
    return Object.keys(counts).sort((a,b) => counts[b] - counts[a])[0];
}

// Simple rules that turn the numbers int advice 
function farmingTip(day) {
    if (day.rainMm >= 5 || day.rainChance >= 0.6) {
        return 'Good rain expected. Skip watering and avoid spraying.';
    }
    if ( day.max >= 35 && day.humidity < 35) {
        return 'Hot and dry. Water crops early morning or evening.';
    }
    if (day.rainChance >= 0.3) {
        return 'Some rain possible. Hold off on heavy watering.';
    }
    if (day.max >= 35) {
        return 'Very hot day. Protect young plants from the midday sun.';
    }
    return 'Mild weather. Good day for field work.';
}

function summarise(date, entries) {
    const temps = entries.map((e) => e.temp);
    const middle = entries[Math.floor(entries.length / 2)];
    const day = {
        date: date,
        min: Math.min(...temps),
        max: Math.max(...temps),
        humidity: Math.round(entries.reduce((sum,e) => sum + e.humidity, 0) / entries.length),
        rainChance: Math.max(...entries.map((e) => e.pop)),
        rainMm: entries.reduce((sum, e) => sum + e.rain, 0),
        wind: Math.max(...entries.map((e) => e.wind)),
        description: mostCommon(entries.map((e) => e.description)),
        icon: middle.icon.replace('n', 'd'),
    };
    day.tip = farmingTip(day);
    return day;
}

function groupByDay(data) {
    const groups = {};
    data.list.forEach((entry) => {
        const local = new Date((entry.dt + data.timezone) * 1000);
        const key = local.toISOString().slice(0, 10);
        if (!groups[key]) groups[key] = [];
        groups[key].push(entry);
    });
    return Object.keys(groups).sort().map((key) => summarise(key, groups[key]));
}

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined)
        node.textContent = text;
    return node;
}

function buildCard(day) {
    const card = el('article', 'card');
    const label = new Date(day.date + 'T00:00:00Z').toLocaleDateString('en-GB', {
        weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
    });

    const icon = document.createElement('img');
    icon.src = 'https://openweathermap.org/img/wn/' + day.icon + '@2x.png';
    icon.alt = day.description;
    
    card.appendChild(icon);
    card.appendChild(el('h3', '', label));
    card.appendChild(el('p', 'desc', day.description ));
    card.appendChild(el('p', '', 'Temperature: ' + Math.round(day.min) + '\u00B0C to ' + Math.round(day.max) + '\u00B0C'));
    card.appendChild(el('p', '', 'Humidity: '+ day.humidity + '%'));
    card.appendChild(el('p', '', 'Rain chance: ' + Math.round(day.rainChance * 100) + '% (' + day.rainMm.toFixed(1) + ' mm)'));  
    card.appendChild(el('p', '', 'Wind: up to ' + day.wind.toFixed(1) + ' m/s'));
    card.appendChild(el('p', 'tip', 'Farm tip: ' + day.tip));
    return card;
}

function render() {
    let list = days.slice();

    const filter = filterE1.value;
    if (filter === 'rain') list = list.filter((d) => d.rainChance >= 0.3 || d.rainMm > 0);
    if (filter === 'hot') list = list.filter((d) => d.max >= 35);
    if (filter === 'cool') list = list.filter((d) => d.max < 30);

    const sorters = {
        date: (a, b) => a.date.localeCompare(b.date),
        hot: (a, b) => b.max - a.max,
        cool: (a, b) => a.min - b.min,
        rain: (a, b) => b.rainChance - a.rainChance,
        humid: (a, b) => b.humidity - a.humidity,
    };
    list.sort(sorters[sortE1.value]);

    resultsE1.replaceChildren();
    if (list.length === 0) {
        showMessage('No days match this filter . Try "All days".', false);
        return;
    }
    showMessage('', false);
    list.forEach((day) => resultsE1.appendChild(buildCard(day)));
}

async function search(city) {
    showMessage('loading forecast...', false);
    try {
        const response = await fetch('/api/forecast?city=' + encodeURIComponent(city));
        const data = await response.json();

        if (!response.ok) {
            controlsE1.hidden = true;
            resultsE1.replaceChildren();
            showMessage(data.error || 'something went wrong. Please try again.', true);
            return;
        }

        days = groupByDay(data);
        titleE1.textContent = data.city + ', ' + data.country;
        controlsE1.hidden = false;
        render();
      try { localStorage.setItem('lastCity', city); } catch (e) { /* ignore */ }
    } catch (err) {
        console.error(err);
        controlsE1.hidden = true;
        resultsE1.replaceChildren();
        showMessage('could not reach the server. Check your internet conection.', true);
    }      
}

form.addEventListener('submit', (event) => {
    event.preventDefault();
    const city = cityInput.value.trim();
    if (!city) {
        showMessage('Type a town name first.', true);
        return;
    }
    search(city);
});

sortE1.addEventListener('change', render);
filterE1.addEventListener('change', render);

// Show which server answered ( for the load balancer demo)
fetch('/api/server')
.then((r) => r.json())
.then((d) => { serverE1.textContent = d.server; })
.catch(() => { serverE1.textContent = 'unknown'; });

// Remeber the last town searrched 
try {
    const last = localStorage.getItem('lastCity');
    if (last) cityInput.value = last;
} catch (e) { /* ignore */ }


