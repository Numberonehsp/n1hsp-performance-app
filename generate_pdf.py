#!/usr/bin/env python3
"""
N1 HSP Performance PDF Generator

Reads a JSON file exported from the web app and produces a branded A4 PDF
with a team summary, one bar chart per metric, then one page per player.

Usage:
    python3 generate_pdf.py session_data.json
    python3 generate_pdf.py session_data.json my_output.pdf
"""

import json, sys, os, math
from io import BytesIO

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.lib.utils import ImageReader

# ---------------------------------------------------------------------------
# Brand colours
# ---------------------------------------------------------------------------
TEAL        = colors.HexColor('#1a6b5c')
TEAL_DARK   = colors.HexColor('#0d4a3f')
TEAL_LIGHT  = colors.HexColor('#e8f5f1')
RED         = colors.HexColor('#8b0000')
BLUE_LIGHT  = colors.HexColor('#4fc3f7')
TEXT        = colors.HexColor('#1a1a1a')
TEXT_MUTED  = colors.HexColor('#666666')
TEXT_FAINT  = colors.HexColor('#999999')
WHITE       = colors.white
BORDER      = colors.HexColor('#e0e0e0')
BG_STRIP    = colors.HexColor('#f2f2f2')
GREEN       = colors.HexColor('#4caf50')
ORANGE      = colors.HexColor('#e55555')

W, H = A4        # 595.27 x 841.89 pt
M    = 14 * mm   # page margin

SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
LOGO_WHITE  = os.path.join(SCRIPT_DIR, 'assests', 'logo-white.png')
LOGO_BLACK  = os.path.join(SCRIPT_DIR, 'assests', 'logo-black.png')
HEADER_H    = 46 * mm
FOOTER_H    = 14 * mm

# ---------------------------------------------------------------------------
# Metric configuration (mirrors config.js)
# ---------------------------------------------------------------------------
METRIC_CFG = {
    'height':               {'label': 'Height',               'unit': 'cm', 'hib': True},
    'weight':               {'label': 'Weight',               'unit': 'kg', 'hib': False},
    'cmj':                  {'label': 'CMJ',                  'unit': 'cm', 'hib': True},
    'sprint_20m':           {'label': '20m Sprint',           'unit': 's',  'hib': False},
    'mas':                  {'label': 'MAS Run (1200m)',       'unit': '',   'hib': False},
    'body_fat_pct':         {'label': 'Body Fat %',           'unit': '%',  'hib': False},
    'body_fat_mass':        {'label': 'Body Fat Mass',        'unit': 'kg', 'hib': False},
    'skeletal_muscle_mass': {'label': 'Skeletal Muscle Mass', 'unit': 'kg', 'hib': True},
}
METRICS_ALL    = ['height', 'weight', 'cmj', 'sprint_20m', 'mas']
METRICS_SENIOR = ['body_fat_pct', 'body_fat_mass', 'skeletal_muscle_mass']


# ---------------------------------------------------------------------------
# Data helpers
# ---------------------------------------------------------------------------
def fmt_mas(min_v, sec_v):
    m = int(float(min_v or 0))
    s = int(float(sec_v or 0))
    return f"{m}:{s:02d}"


def mas_to_s(min_v, sec_v):
    return float(min_v or 0) * 60 + float(sec_v or 0)


def get_val(result, metric):
    if not result:
        return None
    if metric == 'mas':
        if not result.get('mas_min') and not result.get('mas_sec'):
            return None
        return mas_to_s(result.get('mas_min', 0), result.get('mas_sec', 0))
    v = result.get(metric)
    if v is None or v == '':
        return None
    try:
        f = float(v)
        return None if math.isnan(f) else f
    except (ValueError, TypeError):
        return None


def fmt_val(val, metric):
    if val is None:
        return '-'
    if metric == 'mas':
        s = round(val)
        return fmt_mas(s // 60, s % 60)
    return f"{val:.1f}"


def compute_stats(results, metric):
    vals = [v for v in (get_val(r, metric) for r in results) if v is not None]
    if not vals:
        return None
    return {'min': min(vals), 'max': max(vals),
            'avg': sum(vals) / len(vals), 'count': len(vals)}


def metrics_for(team_type):
    return METRICS_ALL + (METRICS_SENIOR if team_type == 'Senior' else [])


# ---------------------------------------------------------------------------
# Chart generation (matplotlib -> PNG bytes)
# ---------------------------------------------------------------------------
def make_chart(player_names, values, prev_values, st, prev_st, metric, cfg):
    n = len(player_names)
    fig_w = max(6.5, n * 0.65)
    fig, ax = plt.subplots(figsize=(fig_w, 3.6))
    fig.patch.set_facecolor('white')
    ax.set_facecolor('white')

    x = np.arange(n)
    bars = ax.bar(x, values, color='#8b0000', width=0.6, zorder=2)

    # White value labels inside bars
    for bar, val in zip(bars, values):
        label = fmt_val(val, metric)
        ht = bar.get_height()
        if ht > 0:
            ax.text(bar.get_x() + bar.get_width() / 2, ht * 0.55,
                    label, ha='center', va='center',
                    color='white', fontsize=7.5, fontweight='bold')

    # Previous score dots (blue circles)
    for i, pv in enumerate(prev_values):
        if pv is not None:
            ax.plot(x[i], pv, 'o', color='#4fc3f7', markersize=7,
                    markeredgecolor='white', markeredgewidth=1.5, zorder=5)

    # Current avg dashed line
    ax.axhline(y=st['avg'], color='#333333', lw=1.5, ls='--', zorder=3)
    ax.text(n - 0.5, st['avg'], f"  Avg: {fmt_val(st['avg'], metric)}",
            ha='right', va='bottom', fontsize=7, color='#333333', fontweight='bold')

    # Previous avg dashed line (blue)
    if prev_st:
        ax.axhline(y=prev_st['avg'], color='#4fc3f7', lw=1.5, ls='--', zorder=3)
        ax.text(n - 0.5, prev_st['avg'],
                f"  Prev avg: {fmt_val(prev_st['avg'], metric)}",
                ha='right', va='bottom', fontsize=7, color='#4fc3f7', fontweight='bold')

    ax.set_xticks(x)
    ax.set_xticklabels(player_names, fontsize=8.5, rotation=35, ha='right')
    ax.tick_params(axis='y', labelsize=8)

    title = cfg['label'] + (f" ({cfg['unit']})" if cfg['unit'] else '')
    ax.set_title(title, fontsize=11, fontweight='bold', color='#8b0000', pad=8, loc='left')

    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.spines['left'].set_color('#cccccc')
    ax.spines['bottom'].set_color('#cccccc')
    ax.yaxis.grid(True, color='#eeeeee', zorder=0)
    ax.set_axisbelow(True)

    if metric == 'mas':
        def _fmt(v, _):
            s = round(v)
            return fmt_mas(s // 60, s % 60)
        ax.yaxis.set_major_formatter(plt.FuncFormatter(_fmt))
    else:
        ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda v, _: f"{v:.1f}"))

    plt.tight_layout(pad=0.5)
    buf = BytesIO()
    fig.savefig(buf, format='png', dpi=160, bbox_inches='tight')
    plt.close(fig)
    buf.seek(0)
    return buf.read()


# ---------------------------------------------------------------------------
# PDF builder
# ---------------------------------------------------------------------------
class PDF:
    def __init__(self, filename):
        self.c = rl_canvas.Canvas(filename, pagesize=A4)
        self.c.setTitle('N1 HSP Performance Report')
        self.c.setAuthor('Number ONE HSP')
        self._pages = 0

    def save(self):
        self.c.save()

    def new_page(self):
        if self._pages > 0:
            self.c.showPage()
        self._pages += 1

    # ── Low-level helpers ────────────────────────────────────────────────────

    def fill(self, clr):
        self.c.setFillColor(clr)

    def stroke(self, clr):
        self.c.setStrokeColor(clr)

    def rect(self, x, y, w, h, fill=True, stroke=False, radius=0):
        if radius:
            self.c.roundRect(x, y, w, h, radius, stroke=int(stroke), fill=int(fill))
        else:
            self.c.rect(x, y, w, h, stroke=int(stroke), fill=int(fill))

    def txt(self, x, y, s, size=10, bold=False, clr=None, align='left'):
        if clr:
            self.c.setFillColor(clr)
        self.c.setFont('Helvetica-Bold' if bold else 'Helvetica', size)
        s = str(s)
        if align == 'center':
            self.c.drawCentredString(x, y, s)
        elif align == 'right':
            self.c.drawRightString(x, y, s)
        else:
            self.c.drawString(x, y, s)

    def line(self, x1, y1, x2, y2, clr=None, lw=1, dash=None):
        if clr:
            self.c.setStrokeColor(clr)
        self.c.setLineWidth(lw)
        self.c.setDash(*(dash if dash else []))
        self.c.line(x1, y1, x2, y2)

    def draw_image(self, src, x, y, w, h):
        try:
            if isinstance(src, (bytes, bytearray)):
                reader = ImageReader(BytesIO(src))
            else:
                reader = ImageReader(src)
            self.c.drawImage(reader, x, y, w, h,
                             preserveAspectRatio=True, mask='auto')
        except Exception:
            pass

    # ── Page-level components ────────────────────────────────────────────────

    def draw_header(self, title, sub1='', sub2=''):
        """Teal gradient header. Returns y coordinate of bottom edge."""
        hy = H - HEADER_H

        # Background — dark teal full width, lighter teal on left 60 %
        self.fill(TEAL_DARK)
        self.rect(0, hy, W, HEADER_H)
        self.fill(TEAL)
        self.rect(0, hy, W * 0.62, HEADER_H)

        # Subtle diagonal accent strip
        self.fill(colors.HexColor('#1e7a69'))
        p = self.c.beginPath()
        p.moveTo(W * 0.55, hy)
        p.lineTo(W * 0.62, hy)
        p.lineTo(W * 0.62, hy + HEADER_H)
        p.lineTo(W * 0.55, hy + HEADER_H)
        p.close()
        self.c.drawPath(p, fill=1, stroke=0)

        # N1HSP logo — right side
        logo_w, logo_h = 36 * mm, 20 * mm
        if os.path.exists(LOGO_WHITE):
            self.draw_image(LOGO_WHITE,
                            W - M - logo_w,
                            hy + (HEADER_H - logo_h) / 2,
                            logo_w, logo_h)

        # Text — left side
        tx = M
        ty = hy + HEADER_H - 12 * mm
        self.txt(tx, ty, title, size=18, bold=True, clr=WHITE)
        if sub1:
            self.txt(tx, ty - 8 * mm, sub1, size=10, clr=colors.HexColor('#b8dcd4'))
        if sub2:
            self.txt(tx, ty - 14 * mm, sub2, size=9, clr=colors.HexColor('#88bfb5'))

        return hy  # bottom of header

    def draw_footer(self):
        """Dark teal footer strip."""
        self.fill(TEAL_DARK)
        self.rect(0, 0, W, FOOTER_H)
        cy = FOOTER_H / 2
        self.txt(W / 2, cy + 2.5, 'NUMBER O1NE HSP  |  HEALTH  |  STRENGTH  |  PERFORMANCE',
                 size=7.5, bold=True, clr=WHITE, align='center')
        self.txt(W / 2, cy - 4, '@NumberOneHSP  |  info@NumberOneHSP.com  |  www.NumberOneHSP.com',
                 size=6.5, clr=colors.HexColor('#88bfb5'), align='center')

    def draw_summary_strip(self, ms, results):
        """Summary cards just below the header. Returns bottom y of strip."""
        cards = []
        for m in ms:
            st = compute_stats(results, m)
            if not st:
                continue
            cfg = METRIC_CFG[m]
            cards.append({
                'label': cfg['label'],
                'unit':  cfg['unit'] or 'avg',
                'value': fmt_val(st['avg'], m),
            })
        if not cards:
            return H - HEADER_H

        strip_top = H - HEADER_H
        strip_h   = 26 * mm
        strip_bot = strip_top - strip_h

        self.fill(BG_STRIP)
        self.rect(0, strip_bot, W, strip_h)

        n = len(cards)
        gap = 3 * mm
        card_w = (W - 2 * M - gap * (n - 1)) / n

        for i, card in enumerate(cards):
            cx = M + i * (card_w + gap)
            cy = strip_bot + 3 * mm
            ch = strip_h - 6 * mm

            # Card background
            self.fill(WHITE)
            self.stroke(BORDER)
            self.c.setLineWidth(0.5)
            self.rect(cx, cy, card_w, ch, fill=True, stroke=True, radius=2)

            # Teal top accent bar
            self.fill(TEAL)
            self.rect(cx, cy + ch - 2, card_w, 2, radius=0)

            mid = cy + ch / 2
            self.txt(cx + card_w / 2, cy + ch - 6 * mm,
                     card['label'], size=6.5, clr=TEXT_MUTED, align='center')
            self.txt(cx + card_w / 2, mid - 1,
                     card['value'], size=13, bold=True, clr=TEAL, align='center')
            self.txt(cx + card_w / 2, cy + 2.5,
                     card['unit'], size=6, clr=TEXT_FAINT, align='center')

        return strip_bot

    def draw_chart_on_page(self, chart_bytes):
        """Embed chart PNG, filling the content area between header and footer."""
        content_top = H - HEADER_H - 4 * mm
        content_bot = FOOTER_H + 4 * mm
        avail_h = content_top - content_bot
        avail_w = W - 2 * M

        reader = ImageReader(BytesIO(chart_bytes))
        iw, ih = reader.getSize()
        scale = min(avail_w / iw, avail_h / ih)
        dw, dh = iw * scale, ih * scale
        ox = M + (avail_w - dw) / 2
        oy = content_bot + (avail_h - dh) / 2
        self.c.drawImage(reader, ox, oy, dw, dh, mask='auto')

    def draw_progress_bar(self, x, y, w, fill_pct, avg_pct, prev_pct=None):
        track_h = 9
        r = 4

        # Track
        self.fill(colors.HexColor('#e8e8e8'))
        self.rect(x, y, w, track_h, radius=r)

        # Fill bar
        if fill_pct > 0:
            fw = max(track_h, w * fill_pct / 100)
            self.fill(RED)
            self.rect(x, y, fw, track_h, radius=r)

        # Avg marker line
        ax_ = x + w * avg_pct / 100
        self.fill(colors.HexColor('#222222'))
        self.rect(ax_ - 1.5, y - 2.5, 3, track_h + 5)

        # Previous dot
        if prev_pct is not None:
            px = x + w * prev_pct / 100
            mid_y = y + track_h / 2
            self.fill(WHITE)
            self.c.circle(px, mid_y, 5.5, stroke=0, fill=1)
            self.fill(BLUE_LIGHT)
            self.stroke(WHITE)
            self.c.setLineWidth(1.5)
            self.c.circle(px, mid_y, 4, stroke=1, fill=1)

    def draw_metric_row(self, x, y, w, metric, result, session_results, prev_result):
        """Draw one metric row. Returns height consumed."""
        cfg = METRIC_CFG[metric]
        current = get_val(result, metric)
        if current is None:
            return 0

        st = compute_stats(session_results, metric)
        if not st:
            return 0

        prev = get_val(prev_result, metric)
        ROW_H = 22 * mm

        # Metric label (upper-left)
        self.txt(x, y - 4 * mm, cfg['label'].upper(),
                 size=7.5, bold=True, clr=TEXT_MUTED)

        # Score (upper-right)
        score_str = fmt_val(current, metric)
        self.txt(x + w, y - 4 * mm, score_str,
                 size=17, bold=True, clr=TEXT, align='right')

        # Unit (next to score)
        if cfg['unit']:
            sw = self.c.stringWidth(score_str, 'Helvetica-Bold', 17)
            self.txt(x + w - sw - 3, y - 4 * mm - 1,
                     cfg['unit'], size=8, clr=TEXT_MUTED)

        # Delta vs previous
        if prev is not None:
            diff = current - prev
            if abs(diff) > 0.001:
                improved = (cfg['hib'] and diff > 0) or (not cfg['hib'] and diff < 0)
                sign = '+' if diff > 0 else '-'
                delta_str = f"{sign}{abs(diff):.1f}"
                delta_clr = GREEN if improved else ORANGE
                sw2 = self.c.stringWidth(score_str, 'Helvetica-Bold', 17)
                uw = self.c.stringWidth(cfg['unit'] + '  ', 'Helvetica', 8) if cfg['unit'] else 0
                self.txt(x + w - sw2 - uw - 10, y - 4 * mm,
                         delta_str, size=9, bold=True, clr=delta_clr)

        # Progress bar
        bar_y = y - 10 * mm
        rng = (st['max'] - st['min']) or 1
        fill_pct = max(0, min(100, (current  - st['min']) / rng * 100))
        avg_pct  = max(0, min(100, (st['avg'] - st['min']) / rng * 100))
        prev_pct = (max(0, min(100, (prev - st['min']) / rng * 100))
                    if prev is not None else None)
        self.draw_progress_bar(x, bar_y, w, fill_pct, avg_pct, prev_pct)

        # Meta stats row
        meta_y = bar_y - 5.5 * mm
        self.txt(x, meta_y,
                 f"Min: {fmt_val(st['min'], metric)}", size=7, clr=TEXT_FAINT)
        mid_label = f"Team avg: {fmt_val(st['avg'], metric)}"
        if prev is not None:
            mid_label += f"   Prev: {fmt_val(prev, metric)}"
        self.txt(x + w / 2, meta_y, mid_label, size=7, clr=TEXT_FAINT, align='center')
        self.txt(x + w, meta_y,
                 f"Best: {fmt_val(st['max'], metric)}", size=7, clr=TEXT_FAINT, align='right')

        # Divider line
        self.line(x, bar_y - 8 * mm, x + w, bar_y - 8 * mm,
                  clr=BORDER, lw=0.5)

        return ROW_H

    def draw_body_comp_header(self, x, y, w):
        self.fill(TEAL_LIGHT)
        self.rect(x - 2 * mm, y - 3.5 * mm, w + 4 * mm, 7.5 * mm)
        self.fill(TEAL)
        self.rect(x - 2 * mm, y + 4 * mm, w + 4 * mm, 1.5)
        self.txt(x, y, 'BODY COMPOSITION', size=8, bold=True, clr=TEAL)


# ---------------------------------------------------------------------------
# Report builder
# ---------------------------------------------------------------------------
def build_report(data, output_path):
    club         = data['club']
    team         = data['team']
    session      = data['session']
    players      = data['players']
    results      = data['results']
    prev_results = data.get('prev_results', [])

    team_type = team.get('type', 'Academy')
    ms        = metrics_for(team_type)
    player_map = {p['id']: p['name'] for p in players}

    pdf = PDF(output_path)

    # ── Page 1: Team cover with summary cards ──────────────────────────────
    pdf.new_page()
    pdf.draw_header(
        title=club['name'],
        sub1=f"{team['name']}  |  {session['date']}",
        sub2='Physical Performance Testing',
    )
    pdf.draw_summary_strip(ms, results)
    pdf.draw_footer()

    # ── One chart page per metric ──────────────────────────────────────────
    for metric in ms:
        cfg = METRIC_CFG[metric]

        filtered = [r for r in results if get_val(r, metric) is not None]
        if not filtered:
            continue

        filtered.sort(
            key=lambda r: get_val(r, metric),
            reverse=cfg['hib'],
        )

        st = compute_stats(filtered, metric)
        prev_filtered = [r for r in prev_results if get_val(r, metric) is not None]
        prev_st = compute_stats(prev_filtered, metric) if prev_filtered else None

        names = [player_map.get(r['player_id'], r['player_id']) for r in filtered]
        vals  = [get_val(r, metric) for r in filtered]
        p_vals = []
        for r in filtered:
            pr = next((p for p in prev_results if p['player_id'] == r['player_id']), None)
            p_vals.append(get_val(pr, metric))

        chart_bytes = make_chart(names, vals, p_vals, st, prev_st, metric, cfg)

        pdf.new_page()
        pdf.draw_header(
            title=club['name'],
            sub1=f"{team['name']}  |  {session['date']}",
            sub2=cfg['label'].upper(),
        )
        pdf.draw_chart_on_page(chart_bytes)
        pdf.draw_footer()

    # ── Individual player report pages ─────────────────────────────────────
    for player in players:
        result = next((r for r in results if r['player_id'] == player['id']), None)
        if not result:
            continue
        prev_result = next((r for r in prev_results if r['player_id'] == player['id']), None)

        pdf.new_page()
        pdf.draw_header(
            title=player['name'],
            sub1=f"{club['name']}  |  {team['name']}",
            sub2=session['date'],
        )
        pdf.draw_footer()

        cur_y      = H - HEADER_H - 5 * mm
        row_gap    = 22 * mm
        content_x  = M
        content_w  = W - 2 * M
        body_done  = False

        for metric in ms:
            # Body composition section divider
            if metric == 'body_fat_pct' and not body_done:
                body_done = True
                cur_y -= 4 * mm
                pdf.draw_body_comp_header(content_x, cur_y, content_w)
                cur_y -= 9 * mm

            used = pdf.draw_metric_row(
                content_x, cur_y, content_w,
                metric, result, results, prev_result,
            )
            if used:
                cur_y -= row_gap

    pdf.save()
    print(f"PDF saved: {output_path}")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
def main():
    if len(sys.argv) < 2:
        print("Usage: python3 generate_pdf.py session_data.json [output.pdf]")
        sys.exit(1)

    json_path = sys.argv[1]
    if not os.path.exists(json_path):
        print(f"Error: file not found: {json_path}")
        sys.exit(1)

    with open(json_path) as f:
        data = json.load(f)

    if len(sys.argv) >= 3:
        output = sys.argv[2]
    else:
        date      = data.get('session', {}).get('date', 'report')
        team_name = data.get('team', {}).get('name', 'team').replace(' ', '-')
        output    = f"n1hsp_{team_name}_{date}.pdf"

    build_report(data, output)


if __name__ == '__main__':
    main()
