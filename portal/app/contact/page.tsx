"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { FiArrowRight, FiChevronDown, FiClock, FiGlobe, FiMail, FiMapPin, FiPhone, FiUser } from "react-icons/fi";
import { Brand } from "@/components/Brand";

const HeadquartersMap = dynamic(() => import("@/components/HeadquartersMap").then(module => module.HeadquartersMap), { ssr: false, loading: () => <div className="map-loading">Loading map…</div> });
export default function ContactPage() {
  const [sent, setSent] = useState(false);
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setSent(true); }
  return <main className="contact-page"><header className="landing-nav"><Link href="/" className="landing-brand" aria-label="Ethiopia Customs Commission home"><Brand variant="dark" /></Link><nav aria-label="Main navigation"><Link href="/">Home</Link><Link href="/about">About</Link><Link className="is-active" href="/contact">Contact</Link></nav><div className="landing-nav-actions"><button className="landing-language" type="button"><FiGlobe /> EN <FiChevronDown /></button><Link href="/login" className="nav-sign-in"><FiUser /> Sign in</Link></div></header>
    <section className="contact-main"><div className="contact-heading"><p className="about-kicker">Get in touch <span /></p><h1>Get in touch</h1></div><div className="contact-grid"><form onSubmit={submit} className="contact-form">{sent ? <p className="contact-success">Thank you — your message has been received.</p> : <><input required placeholder="Full Name" aria-label="Full Name" /><input required type="email" placeholder="Email Address" aria-label="Email Address" /><input required placeholder="Subject" aria-label="Subject" /><textarea required placeholder="Message" aria-label="Message" /><button type="submit">Send Message</button></>}</form><aside className="contact-details"><h2>Our Headquarters</h2><p><FiMapPin />Ethiopian Customs Commission<br />Head Office, Addis Ababa, Ethiopia</p><h2>Technical Support</h2><p><FiMail />support@customs.et</p><p><FiPhone />+251 11 123 4567</p><p><FiClock />Mon – Fri, 8:00 AM – 5:00 PM EAT</p><small>For immediate assistance, please check our <a href="#">FAQs</a> or <a href="#">User Guide</a> in the navigation.</small></aside></div><div className="contact-map-wrap"><HeadquartersMap /></div></section>
    <section className="about-access"><div className="landing-wrap"><i><FiArrowRight /></i><span><strong>Ready to access the workspace?</strong><small>Sign in to access customs valuation evidence.</small></span><Link href="/login" className="landing-primary"><FiUser /> Sign in to workspace <FiArrowRight /></Link></div></section><Footer /></main>;
}
function Footer() { return <footer className="landing-footer"><div className="landing-wrap footer-main"><div><Brand variant="light" /><p className="footer-portal">Customs Valuation Portal</p></div><div><h4>Navigation</h4><Link href="/">Home</Link><Link href="/about">About</Link><Link href="/contact">Contact</Link></div><div><h4>Support</h4><a href="#">Help</a><a href="#">User Guide</a><a href="#">FAQs</a></div><div><h4>Legal</h4><a href="#">Privacy Policy</a><a href="#">Terms of Service</a></div></div><div className="landing-wrap footer-bottom"><span>© 2026 Ethiopia Customs Commission</span><span>Secure borders. Prosperous nation.</span></div></footer>; }
