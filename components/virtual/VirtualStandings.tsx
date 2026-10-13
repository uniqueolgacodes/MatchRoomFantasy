'use client';
import { TeamBadge } from './TeamBadge';

export interface StandingsRow {
    team_id: string;
    name: string;
    short_name: string;
    primary_color: string;
    secondary_color: string;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    goal_difference: number;
    points: number;
    form: string[];
}

export function VirtualStandings({ standings }: { standings: StandingsRow[] }) {
    // Sort: Pts first, then GD, then Wins
    const sorted = [...standings].sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.goal_difference !== a.goal_difference) return b.goal_difference - a.goal_difference;
        return b.won - a.won;
    });

    return (
        <div className="rounded-xl border border-white/10 bg-ink-soft overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-white/80">
                    <thead className="bg-white/5 text-xs uppercase text-white/50 border-b border-white/10">
                        <tr>
                            <th className="px-4 py-3">Team</th>
                            <th className="px-2 py-3 text-center">P</th>
                            <th className="px-2 py-3 text-center">W</th>
                            <th className="px-2 py-3 text-center">D</th>
                            <th className="px-2 py-3 text-center">L</th>
                            <th className="px-2 py-3 text-center">GD</th>
                            <th className="px-3 py-3 text-center font-bold text-white">Pts</th>
                            <th className="px-4 py-3 text-center hidden sm:table-cell">Form</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {sorted.map((row, i) => (
                            <tr key={row.team_id} className="hover:bg-white/[0.02] transition-colors">
                                <td className="px-4 py-2.5 flex items-center gap-2">
                                    <span className="w-4 text-xs text-white/40 text-right mr-1">{i + 1}</span>
                                    <TeamBadge shortName={row.short_name} primaryColor={row.primary_color} secondaryColor={row.secondary_color} size="sm" />
                                    <span className="font-medium">{row.short_name}</span>
                                </td>
                                <td className="px-2 py-2.5 text-center">{row.played}</td>
                                <td className="px-2 py-2.5 text-center">{row.won}</td>
                                <td className="px-2 py-2.5 text-center">{row.drawn}</td>
                                <td className="px-2 py-2.5 text-center">{row.lost}</td>
                                <td className="px-2 py-2.5 text-center">{row.goal_difference > 0 ? `+${row.goal_difference}` : row.goal_difference}</td>
                                <td className="px-3 py-2.5 text-center font-bold text-pitch-light">{row.points}</td>
                                <td className="px-4 py-2.5 text-center hidden sm:table-cell">
                                    <div className="flex justify-center gap-1">
                                        {row.form.map((res, idx) => (
                                            <span key={idx} className={`w-3.5 h-3.5 rounded-sm text-[9px] flex items-center justify-center font-bold text-white ${res === 'W' ? 'bg-pitch' : res === 'D' ? 'bg-white/30' : 'bg-red-500'
                                                }`}>{res}</span>
                                        ))}
                                        {row.form.length === 0 && <span className="text-white/20">-</span>}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}