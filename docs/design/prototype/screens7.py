"""Batch 7: the two full dark screens drawn by hand (Hand something off, Speaking), kept as templates in hand/.
Run: python3 screens7.py (writes every screen, light and dark)."""
import os

from build import GLASS, ON_DARK, DARK, logic, page, screen, write_all
import screens6  # noqa: F401  (registers earlier batches)

HAND = os.path.join(os.path.dirname(__file__), 'hand')


def template(name, ext):
    with open(os.path.join(HAND, f'{name}.{ext}')) as f:
        return f.read()


@screen
def NAsk():
    glow = 'radial-gradient(100% 50% at 50% 0%, rgba(51,85,255,0.30) 0%, rgba(51,85,255,0) 100%)'
    css = '\n.rail{scrollbar-width:none}\n.rail::-webkit-scrollbar{display:none}\ntextarea::placeholder{color:var(--on-night-dim)}'
    return page('Hand something off', template('NAsk', 'body.html'), ground=DARK, bg_image=glow, color=ON_DARK,
                extra_css=css, script=logic(template('NAsk', 'vals.js')))


@screen
def NVoice():
    glow = 'radial-gradient(90% 40% at 50% 68%, rgba(51,85,255,0.28) 0%, rgba(51,85,255,0) 100%)'
    css = ('\n@keyframes ring{0%{transform:scale(1);opacity:.5}100%{transform:scale(1.9);opacity:0}}'
           '\n@keyframes orb{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}'
           '\n.ring{animation:ring 2.4s ease-out infinite}\n.ring2{animation-delay:1.2s}'
           '\n.orb{animation:orb 2.4s ease-in-out infinite}'
           '\n@media (prefers-reduced-motion:reduce){.ring,.orb{animation:none}}')
    return page('Speaking', template('NVoice', 'body.html'), ground=DARK, bg_image=glow, color=ON_DARK,
                extra_css=css, script=logic(''))


if __name__ == '__main__':
    write_all()
