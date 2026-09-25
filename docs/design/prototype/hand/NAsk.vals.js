    const SUGGEST = ['Brief me on my inbox every weekday at 7:30', 'Tell me when the MacBook Air drops below ₹90,000', 'Find three venues for the team offsite'];
    out.text = st.text ?? 'Find a time next week for a 30-minute call with Maya and send her an invite.';
    out.typed = (e) => this.setState({ text: e.target.value });
    SUGGEST.forEach((t, i) => { out['s' + i] = () => this.setState({ text: t }); });
    out.empty = !out.text.trim();
    out.ready = !out.empty;
    // Attachments: each shows as a chip on the request and can be removed.
    const atts = st.atts || [];
    out.atts = atts.map((name, i) => ({ name: name, remove: () => this.setState({ atts: atts.filter((_, k) => k !== i) }) }));
    out.attachOpen = Boolean(st.attachOpen);
    out.flipAttach = () => this.setState({ attachOpen: !st.attachOpen });
    const NAMES = { photo: 'Photo · IMG_2041.jpg', camera: 'Photo · just taken', file: 'File · pricing.pdf', link: 'Link · store.example.in' };
    Object.keys(NAMES).forEach((k) => {
      out['add_' + k] = () => this.setState({ atts: atts.concat([NAMES[k]]), attachOpen: false });
    });