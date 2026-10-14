/**
 * The evening city from the designer's title art,
 * drawn for the home screen: clouds and stars, the skyline with its lit
 * windows, and the coral studio building with its mast. Colors come from the
 * theme tokens; the sky behind it is the gradient of `.home`.
 */
export function TitleArt() {
  // The skyline, left to right: [x, top] corners of a silhouette that stands on the ground.
  const skyline = 'M0 900V640h50v-40h60v-50h200v70h30v-60h70v90h60V560h160v330h690V700h40v-60h60v-50h30v50h50v70h60V590h50v-40h90v40h80v60h60v250z';
  /** Lit windows, each inside one of the silhouettes. */
  const windows = [
    [150, 600], [162, 600], [150, 640], [240, 590], [240, 700], [252, 700], [280, 760], [150, 780], [360, 600], [384, 640], [360, 700],
    [500, 610], [512, 610], [590, 650], [500, 720], [590, 760], [602, 760], [540, 820], [1380, 680], [1392, 680], [1380, 740], [1465, 690], [1477, 760], [1575, 640], [1575, 700],
  ];
  const floors = [512, 628, 744, 860];
  const bays = [700, 818, 936, 1054];
  /** Windows with the light on, as "floor:bay:pane". */
  const lit = new Set(['0:2:0', '0:2:1', '1:3:1', '2:3:0', '3:2:0', '3:2:1', '1:0:1']);

  return (
    <svg className="title-art" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <g className="art-star">
        {[[190, 88, 6], [412, 194, 10], [658, 324, 10], [1118, 142, 6], [1274, 297, 10], [1592, 310, 6], [1735, 308, 10], [860, 60, 5], [1450, 70, 7], [70, 250, 6]].map(([x, y, r]) => (
          <path key={`${x}:${y}`} d={`M${x! - 160} ${y! - r!}l${r} ${r}-${r} ${r}-${r}-${r}z`} />
        ))}
      </g>
      <g className="art-cloud">
        <path d="M1040 150a52 52 0 0 1 96-22 40 40 0 0 1 64 22h60a8 8 0 0 1 0 16h-290a8 8 0 0 1 0-16z" />
        <path d="M510 245a38 38 0 0 1 70-16 30 30 0 0 1 48 16h44a7 7 0 0 1 0 14H470a7 7 0 0 1 0-14z" />
        <path d="M160 410a46 46 0 0 1 86-20 36 36 0 0 1 58 20h60a8 8 0 0 1 0 16H110a8 8 0 0 1 0-16z" />
      </g>
      {/* The bank of clouds behind the city. */}
      <g className="art-haze">
        {[[60, 610, 120], [250, 560, 100], [420, 600, 110], [590, 570, 80], [1180, 640, 90], [1340, 620, 110], [1500, 600, 100], [1640, 640, 120]].map(([x, y, r]) => (
          <circle key={x} cx={x! - 20} cy={y} r={r} />
        ))}
        <rect x="0" y="640" width="1600" height="260" />
      </g>
      <path className="art-city" d={skyline} />
      <g className="art-lit">
        {windows.map(([x, y]) => (
          <rect key={`${x}:${y}`} x={x} y={y} width="6" height="14" />
        ))}
      </g>

      {/* The studio: a coral building with a mast on its roof. */}
      <g>
        <g className="art-mast">
          <path d="M775 440 792 150M815 440 798 150" />
          <path d="M777 410l35-30-33-30 31-30-29-30 27-30-25-30 23-30" />
          <path d="M795 150v-26" />
          <ellipse className="art-dish" cx="768" cy="262" rx="13" ry="30" />
          <ellipse className="art-dish" cx="816" cy="196" rx="9" ry="15" />
        </g>
        <circle className="art-glow" cx="795" cy="118" r="20" />
        <circle className="art-lamp" cx="795" cy="118" r="5" />
        <rect className="art-side" x="1150" y="456" width="62" height="444" />
        <rect className="art-wall" x="670" y="456" width="480" height="444" />
        <rect className="art-hut" x="1030" y="386" width="92" height="70" />
        <rect className="art-side" x="1122" y="386" width="26" height="70" />
        <rect className="art-pane" x="1050" y="406" width="22" height="50" />
        <rect className="art-trim" x="662" y="440" width="496" height="18" />
        <rect className="art-side" x="1158" y="440" width="62" height="18" />
        {floors.map((y, floor) => (
          <g key={y}>
            {floor > 0 && <rect className="art-trim" x="670" y={y - 34} width="480" height="8" />}
            {bays.map((x, bay) =>
              [0, 1].map((pane) => (
                <rect key={`${bay}:${pane}`} className={lit.has(`${floor}:${bay}:${pane}`) ? 'art-pane lit' : 'art-pane'} x={x + pane * 36} y={y} width="24" height="70" rx="12" />
              )),
            )}
            {[0, 1].map((pane) => (
              <rect key={pane} className="art-pane dim" x={1166 + pane * 22} y={y} width="14" height="70" rx="7" />
            ))}
          </g>
        ))}
      </g>

      {/* Lights out of focus in the foreground. */}
      <g className="art-bokeh">
        <circle cx="230" cy="800" r="86" />
        <circle cx="420" cy="870" r="60" />
        <circle cx="1280" cy="810" r="70" />
        <circle cx="1500" cy="760" r="110" />
      </g>
    </svg>
  );
}
