import { useEffect } from "react";

import CallToAction from "../../components/landing/CallToAction";
import FeatureCards from "../../components/landing/FeatureCards";
import Hero from "../../components/landing/Hero";
import HowItWorks from "../../components/landing/HowItWorks";
import LiveDashboardPreview from "../../components/landing/LiveDashboardPreview";
import StatsStrip from "../../components/landing/StatsStrip";

/**
 * Public landing page.
 *
 * Section ids match the Navbar anchors (/#features, /#how-it-works, ...).
 * `scroll-mt-24` keeps each section clear of the sticky navbar when jumped to.
 */
function LandingPage() {
  useEffect(() => {
    document.title = "AETIS | Safer Roads. Faster Response.";
  }, []);

  return (
    <div className="flex flex-col gap-16 pb-16 sm:gap-20 lg:gap-24">
      <section id="home" className="scroll-mt-24">
        <Hero />
      </section>

      <section id="features" className="scroll-mt-24">
        <FeatureCards />
      </section>

      <section id="how-it-works" className="scroll-mt-24">
        <HowItWorks />
      </section>

      <section id="about" className="scroll-mt-24">
        <LiveDashboardPreview />
      </section>

      <section id="impact" className="scroll-mt-24">
        <StatsStrip />
      </section>

      <section id="get-started" className="scroll-mt-24">
        <CallToAction />
      </section>
    </div>
  );
}

export default LandingPage;