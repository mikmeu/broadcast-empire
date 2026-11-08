import beerstar from '../assets/sponsors/beerstar.png';
import citrus from '../assets/sponsors/citrus.png';
import dreamscape from '../assets/sponsors/dreamscape.png';
import ferroMotors from '../assets/sponsors/ferro-motors.png';
import foodst from '../assets/sponsors/foodst.png';
import ipsumIpsum from '../assets/sponsors/ipsum-ipsum.png';
import jupiter from '../assets/sponsors/jupiter.png';
import manen from '../assets/sponsors/manen.png';
import moonCapital from '../assets/sponsors/moon-capital.png';
import safesure from '../assets/sponsors/safesure.png';
import tahoma from '../assets/sponsors/tahoma.png';
import voltamax from '../assets/sponsors/voltamax.png';

export const LOGOS: Record<string, string> = {
  Beerstar: beerstar,
  Citrus: citrus,
  'Dreamscape Holidays': dreamscape,
  'Ferro Motors': ferroMotors,
  Foodst: foodst,
  'Ipsum & Ipsum': ipsumIpsum,
  Jupiter: jupiter,
  Manen: manen,
  'Moon Capital': moonCapital,
  'SafeSure Insurance': safesure,
  Tahoma: tahoma,
  'Voltamax Energy': voltamax,
};

/** A sponsor's logo. Sponsors from older saves have none and show nothing. */
export function SponsorLogo({ sponsor, size = 40 }: { sponsor: string; size?: number }) {
  const src = LOGOS[sponsor];
  return src ? <img className="sponsor-logo" src={src} width={size} height={size} alt="" /> : null;
}
