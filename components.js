// components.js
// Vue Component Definitions

/* global Vue, Pinia */
import { useMatchStore } from './store.js';

const { computed, onMounted } = Vue;
const { storeToRefs } = Pinia;

export const AppHeader = {
    template: '#t-app-header',
    props: ['currentTab'],
    emits: ['update:currentTab', 'open-settings']
};

export const MatchSummary = {
    template: '#t-match-summary',
    props: ['match', 'stats', 'striker', 'nonStriker', 'bowler', 'strikerStats', 'nonStrikerStats', 'bowlerStats', 'inputMode', 'wicketState'],
    emits: ['card-click']
};

export const PlayerCard = {
    template: '#t-player-card',
    props: ['player', 'stats', 'variant', 'isActive', 'isOut', 'isResting', 'isStriker', 'isNonStriker'],
    emits: ['click', 'delete'],
    computed: {
        cardClasses() {
            const c = [];
            if (this.isStriker) c.push('card-active-striker');
            else if (this.isNonStriker) c.push('card-active-nonstriker');
            else if (this.variant === 'bowler' && this.isActive) c.push('card-active-bowler');
            if (this.isOut) c.push('opacity-50 grayscale');
            return c.join(' ');
        }
    }
};

export const ControlPad = {
    template: '#t-control-pad',
    props: ['inputMode', 'deliveryModifiers', 'wicketState', 'inningsStatus', 'canScore'],
    emits: ['score', 'undo', 'swap', 'retire', 'toggle-wide', 'toggle-noball', 'wicket-mode', 'confirm-wicket', 'cancel-wicket', 'start-innings', 'open-settings', 'open-innings']
};

export const ScorecardView = {
    template: '#t-scorecard-view',
    props: ['match', 'players', 'deliveries'],
    setup(props) {
        const store = useMatchStore();
        const data = (inn) => {
            const dList = props.deliveries.filter(d => d.inning === inn);
            if(!dList.length && inn !== 1) return null;
            const tm = inn === 1 ? store.inning1TeamName : store.inning2TeamName;
            const tmPlayers = props.players.filter(p => p.team === tm);
            const batting = tmPlayers.map(p => {
                const s = store.getPlayerStats(p.id, inn);
                const isOut = props.deliveries.some(d => d.inning === inn && d.isWicket && d.wicketPlayerId === p.id);
                return { ...p, ...s, status: isOut?'out':(s.balls>0?'batting':''), dismissalText: isOut?'out':'not out' };
            });
            let runs=0; dList.forEach(d => runs += d.runs + d.extras.wide + d.extras.noBall + (d.extras.byes||0));
            return { teamName: tm, batting, total: runs, overs: Math.floor(dList.filter(d=>d.isLegal).length/6), extras: {total:0, wide:0, noBall:0, byes:0}, fow: [] };
        };
        return { data };
    }
};

// Main App Component that composes everything
export const App = {
    components: { AppHeader, MatchSummary, PlayerCard, ControlPad, ScorecardView },
    setup() {
        const store = useMatchStore();
        const { currentTab, match, stats, strikerId, nonStrikerId, bowlerId, inputMode, wicketState, deliveryModifiers, players, deliveries, inningsStatus } = storeToRefs(store);

        onMounted(() => store.init());

        const striker = computed(() => players.value.find(p => p.id === strikerId.value));
        const nonStriker = computed(() => players.value.find(p => p.id === nonStrikerId.value));
        const bowler = computed(() => players.value.find(p => p.id === bowlerId.value));
        
        const battingTeam = computed(() => players.value.filter(p => p.team === match.value?.battingFirst));
        const bowlingTeam = computed(() => players.value.filter(p => p.team !== match.value?.battingFirst));

        const handleCardClick = (type) => {
            if (inputMode.value !== 'normal') return;
            if (type === 'striker') strikerId.value = null;
            else if (type === 'nonStriker') nonStrikerId.value = null;
            else if (type === 'bowler') bowlerId.value = null;
        };

        const selectPlayer = (p, role) => {
            if (role === 'bat') {
                if (!strikerId.value && p.id !== nonStrikerId.value) strikerId.value = p.id;
                else if (!nonStrikerId.value && p.id !== strikerId.value) nonStrikerId.value = p.id;
            } else {
                if (!bowlerId.value) bowlerId.value = p.id;
            }
        };

        return {
            store, currentTab, match, stats,
            striker, nonStriker, bowler,
            strikerStats: computed(() => store.getPlayerStats(strikerId.value)),
            nonStrikerStats: computed(() => store.getPlayerStats(nonStrikerId.value)),
            bowlerStats: computed(() => store.getBowlerStats(bowlerId.value)),
            battingTeam, bowlingTeam,
            inputMode, wicketState, deliveryModifiers, inningsStatus,
            handleCardClick, selectPlayer, players, deliveries
        };
    },
    template: `
        <div class="h-full flex flex-col">
            <AppHeader v-model:currentTab="currentTab" @open-settings="store.init()" />
            
            <main class="flex-1 overflow-hidden relative flex flex-col">
                <template v-if="currentTab === 'live' && match">
                    <MatchSummary 
                        :match="match" :stats="stats" 
                        :striker="striker" :nonStriker="nonStriker" :bowler="bowler"
                        :strikerStats="strikerStats" :nonStrikerStats="nonStrikerStats" :bowlerStats="bowlerStats"
                        :inputMode="inputMode" :wicketState="wicketState"
                        @card-click="handleCardClick" />

                    <div class="flex-1 flex flex-col md:flex-row overflow-hidden relative">
                        <div class="flex-1 flex flex-col border-b md:border-b-0 md:border-r border-white/5 bg-slate-900/30">
                            <div class="p-2 border-b border-white/5 bg-slate-900/80 text-xs font-bold text-slate-400 sticky top-0 uppercase tracking-wide">Batting</div>
                            <div class="flex-1 overflow-y-auto p-2 grid grid-cols-2 sm:grid-cols-3 gap-2 content-start">
                                <PlayerCard v-for="p in battingTeam" :key="p.id" 
                                    :player="p" :stats="store.getPlayerStats(p.id)" variant="batter"
                                    :isStriker="striker?.id===p.id" :isNonStriker="nonStriker?.id===p.id"
                                    @click="selectPlayer(p, 'bat')" />
                            </div>
                        </div>
                        <div class="flex-1 flex flex-col bg-slate-900/30">
                            <div class="p-2 border-b border-white/5 bg-slate-900/80 text-xs font-bold text-slate-400 sticky top-0 uppercase tracking-wide">Bowling</div>
                            <div class="flex-1 overflow-y-auto p-2 grid grid-cols-2 sm:grid-cols-3 gap-2 content-start">
                                <PlayerCard v-for="p in bowlingTeam" :key="p.id" 
                                    :player="p" :stats="store.getBowlerStats(p.id)" variant="bowler"
                                    :isActive="bowler?.id===p.id"
                                    @click="selectPlayer(p, 'bowl')" />
                            </div>
                        </div>
                    </div>

                    <ControlPad 
                        :inputMode="inputMode" :deliveryModifiers="deliveryModifiers" :wicketState="wicketState" :inningsStatus="inningsStatus"
                        :canScore="striker && nonStriker && bowler"
                        @score="store.addBall" 
                        @toggle-wide="deliveryModifiers.isWide = !deliveryModifiers.isWide"
                        @toggle-noball="deliveryModifiers.isNoBall = !deliveryModifiers.isNoBall"
                        @start-innings="store.inningsStatus='active'; store.MatchService.updateMatch(match.id, {inningsStatus:'active'})"
                        @undo="/* Implement undo */" 
                        @wicket-mode="store.inputMode='wicket'" 
                        @cancel-wicket="store.inputMode='normal'"
                        />
                </template>

                <ScorecardView v-if="currentTab === 'scorecard'" :match="match" :players="players" :deliveries="deliveries" />
                
                <div v-if="currentTab === 'history'" class="flex-1 p-4 bg-slate-950">
                    <button @click="store.startAutoMatch()" class="btn-action bg-emerald-600 px-4 py-2 text-white mb-4">New Match</button>
                    <div v-for="m in store.matchesList" :key="m.id" @click="store.loadMatch(m.id); store.currentTab='live'" class="p-4 border border-slate-700 rounded mb-2 cursor-pointer hover:bg-slate-900">
                        {{ m.homeTeam }} vs {{ m.awayTeam }} - {{ m.status }}
                    </div>
                </div>
            </main>
        </div>
    `
};