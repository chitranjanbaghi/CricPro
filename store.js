// store.js
// Global State Management using Pinia

/* global Pinia, Vue */
import { MatchService } from './MatchService.js';

const { defineStore } = Pinia;
const { ref, computed } = Vue;

export const useMatchStore = defineStore('match', () => {
    const currentTab = ref('live');
    const match = ref(null);
    const deliveries = ref([]);
    const players = ref([]);
    const matchesList = ref([]);
    
    // UI State
    const strikerId = ref(null);
    const nonStrikerId = ref(null);
    const bowlerId = ref(null);
    const inningsStatus = ref('ready');
    
    const inputMode = ref('normal');
    const deliveryModifiers = ref({ isWide: false, isNoBall: false });
    const wicketState = ref({ player: null, type: 'Caught', runs: 0, extra: 'none', fielder: null });

    // Core Logic Computed Helpers
    const inning1TeamName = computed(() => match.value?.tossChoice === 'bat' ? match.value.tossWinner : (match.value?.tossWinner === match.value?.homeTeam ? match.value?.awayTeam : match.value?.homeTeam));
    const inning2TeamName = computed(() => inning1TeamName.value === match.value?.homeTeam ? match.value?.awayTeam : match.value?.homeTeam);
    
    const stats = computed(() => {
        let runs = 0, wickets = 0, validBalls = 0, pRuns = 0, pBalls = 0;
        let extras = { wide: 0, noBall: 0, byes: 0, total: 0 };
        const curInning = match.value?.currentInning || 1;
        const dList = deliveries.value.filter(d => d.inning === curInning);
        const fow = [];

        dList.forEach(d => {
            const bx = d.extras.wide + d.extras.noBall + (d.extras.byes || 0);
            runs += d.runs + bx;
            extras.wide += d.extras.wide; extras.noBall += d.extras.noBall; extras.byes += (d.extras.byes || 0); extras.total += bx;
            if (d.isLegal) validBalls++;
            if (d.isWicket) {
                wickets++;
                const p = players.value.find(pl => pl.id === d.wicketPlayerId);
                fow.push({ score: runs, wicket: wickets, name: p?.name, over: `${Math.floor(validBalls/6)}.${validBalls%6}` });
            }
        });
        
        // Partnership
        for (let i = dList.length - 1; i >= 0; i--) {
            if (dList[i].isWicket) break;
            pRuns += dList[i].runs + dList[i].extras.wide + dList[i].extras.noBall + (dList[i].extras.byes || 0);
            if (dList[i].isLegal) pBalls++;
        }

        const overs = Math.floor(validBalls / 6);
        const balls = validBalls % 6;
        const recent = dList.slice(-6).map(d => {
            let label = d.isWicket ? "W" : "";
            if (d.extras.noBall) label += "nb"; if (d.extras.wide) label += "wd";
            if (!label || d.runs > 0) label = (d.runs > 0 ? d.runs : "") + label;
            if (label === "") label = "0"; 
            return { ...d, label };
        });

        let rrr = null;
        if (match.value && match.value.currentInning === 2) {
                const inn1Runs = deliveries.value.filter(d => d.inning === 1).reduce((s,d) => s + d.runs + d.extras.wide + d.extras.noBall + (d.extras.byes||0), 0);
                const target = inn1Runs + 1;
                const remRuns = target - runs;
                const remBalls = (match.value.overs * 6) - validBalls;
                if (remBalls > 0 && remRuns > 0) rrr = ((remRuns / remBalls) * 6).toFixed(2);
        }

        return { score: `${runs}/${wickets}`, overs: `${overs}.${balls}`, crr: validBalls > 0 ? (runs / (validBalls/6)).toFixed(2) : '0.00', rrr, validBalls, wickets, totalRuns: runs, recentBalls: recent, partnership: { runs: pRuns, balls: pBalls }, extras, fow };
    });

    // Actions
    async function init() {
        MatchService.init();
        matchesList.value = await MatchService.getAllMatches();
        const last = await MatchService.getLastMatch();
        if (last?.status === 'LIVE') loadMatch(last.id);
    }

    async function loadMatch(id) {
        match.value = await MatchService.getMatch(id);
        players.value = await MatchService.getPlayers(id);
        deliveries.value = await MatchService.getDeliveries(id);
        inningsStatus.value = match.value.inningsStatus || 'ready';
        strikerId.value = null; nonStrikerId.value = null; bowlerId.value = null; 
    }

    async function startAutoMatch() {
        const id = await MatchService.createMatch({
            homeTeam: 'Home', awayTeam: 'Away', overs: 10, date: new Date(), status: 'LIVE', 
            battingFirst: 'Home', tossWinner: 'Home', tossChoice: 'bat', inningsStatus: 'ready', currentInning: 1, 
            freeHitEnabled: true, lastManStanding: true
        });
        const r1 = Array.from({length:6},(_,i)=>({matchId:id,name:`Player ${i+1}`,team:'Home',role:'allrounder',status:'active'}));
        const r2 = Array.from({length:6},(_,i)=>({matchId:id,name:`Player ${i+1}`,team:'Away',role:'allrounder',status:'active'}));
        await MatchService.db.players.bulkAdd([...r1, ...r2]);
        await loadMatch(id);
    }

    async function addBall(runs) {
        const wide = deliveryModifiers.value.isWide;
        const noBall = deliveryModifiers.value.isNoBall;
        const delivery = {
            matchId: match.value.id, inning: match.value.currentInning, timestamp: Date.now(),
            over: Math.floor(stats.value.validBalls / 6),
            strikerId: strikerId.value, nonStrikerId: nonStrikerId.value, bowlerId: bowlerId.value,
            runs: runs, extras: { wide: wide ? 1 + runs : 0, noBall: noBall ? 1 : 0, byes: 0 },
            isWicket: false, isLegal: !wide && !noBall
        };
        
        deliveries.value.push(delivery);
        const id = await MatchService.addDelivery(delivery);
        delivery.id = id;

        // Rotation
        let rotate = (runs % 2 !== 0);
        if ((wide || noBall) && runs % 2 !== 0) rotate = true;
        else if (delivery.isLegal && (stats.value.validBalls) % 6 === 0) { rotate = !rotate; bowlerId.value = null; }
        
        if (rotate && nonStrikerId.value) {
            const temp = strikerId.value; strikerId.value = nonStrikerId.value; nonStrikerId.value = temp;
        }
        
        deliveryModifiers.value.isWide = false; deliveryModifiers.value.isNoBall = false;
    }

    function getPlayerStats(id, inning = match.value?.currentInning) {
        if (!id) return { runs: 0, balls: 0, fours: 0, sixes: 0, sr: '0.0' };
        const balls = deliveries.value.filter(d => d.inning === inning && d.strikerId === id && d.extras.wide === 0);
        const runs = balls.reduce((a, b) => a + b.runs, 0);
        return { 
            runs, balls: balls.length, 
            fours: balls.filter(d=>d.runs===4).length, sixes: balls.filter(d=>d.runs===6).length,
            sr: balls.length ? ((runs/balls.length)*100).toFixed(1) : '0.0'
        };
    }

    function getBowlerStats(id, inning = match.value?.currentInning) {
        if (!id) return { figures: '0-0 (0.0)', overs: '0.0', maidens: 0, runs: 0, wickets: 0, econ: '0.00', wides: 0 };
        const balls = deliveries.value.filter(d => d.inning === inning && d.bowlerId === id);
        let runs = 0, wkts = 0, legal = 0, wides = 0;
        balls.forEach(d => { runs += d.runs + d.extras.wide + d.extras.noBall; if(d.isWicket) wkts++; if(d.isLegal) legal++; wides+=d.extras.wide; });
        const ov = `${Math.floor(legal/6)}.${legal%6}`;
        const od = Math.floor(legal/6) + (legal%6)/6;
        return { figures: `${wkts}-${runs}`, overs: ov, runs, wickets: wkts, econ: od > 0 ? (runs/od).toFixed(2) : '0.00', wides, maidens: 0 };
    }

    return {
        currentTab, match, deliveries, players, matchesList,
        strikerId, nonStrikerId, bowlerId, inningsStatus,
        inputMode, deliveryModifiers, wicketState,
        stats, inning1TeamName, inning2TeamName,
        init, startAutoMatch, loadMatch, addBall, getPlayerStats, getBowlerStats, MatchService
    };
});