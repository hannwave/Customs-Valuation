"use client";

import Link from "next/link";
import { FiArrowRight, FiChevronDown, FiEye, FiFeather, FiGlobe, FiSettings, FiShield, FiTarget, FiThumbsUp, FiUsers, FiUser, FiZap } from "react-icons/fi";
import type { IconType } from "react-icons";
import { Brand } from "@/components/Brand";

const values: [IconType, string, string][] = [
  [FiShield, "Integrity", "We act with honesty, transparency and accountability in everything we do."],
  [FiUsers, "Service Excellence", "We put our customers and stakeholders at the center of our work."],
  [FiZap, "Innovation", "We embrace technology and new ideas to create better solutions."],
  [FiFeather, "Sustainability", "We support inclusive growth and a resilient economy for future generations."],
];

const teamItems: [IconType, string, string][] = [
  [FiUsers, "Skilled Professionals", "Experts in customs, trade, finance, law and technology."],
  [FiSettings, "Modern Systems", "Secure, scalable and built for the future."],
  [FiThumbsUp, "Trusted Partnerships", "Working with national and international partners for greater impact."],
];

export default function AboutPage() {
  return <main className="about-page">
    <header className="landing-nav"><Link href="/" className="landing-brand" aria-label="Ethiopia Customs Commission home"><Brand variant="dark" /></Link><nav aria-label="Main navigation"><Link href="/">Home</Link><Link className="is-active" href="/about">About</Link><Link href="/contact">Contact</Link></nav><div className="landing-nav-actions"><button className="landing-language" type="button"><FiGlobe /> EN <FiChevronDown /></button><Link href="/login" className="nav-sign-in"><FiUser /> Sign in</Link></div></header>
    <section className="about-hero"><div className="landing-wrap about-hero-copy"><p className="landing-kicker"><span />About us <span /></p><h1>Building a smarter<br />and more transparent<br /><em>customs system for Ethiopia.</em></h1><p>The Ethiopia Customs Commission (ECC) is committed to facilitating legitimate trade, protecting the national economy, and serving our citizens through efficient, transparent, and technology-driven customs services.</p></div></section>
    <section className="about-mission landing-wrap"><article><p className="about-kicker">Our mission <span /></p><div><i><FiTarget /></i><section><h2>Facilitate Trade,<br />Build Prosperity</h2><p>To enable legitimate trade, ensure proper revenue collection, and protect society by delivering efficient, transparent and technology-driven customs services.</p></section></div></article><article><p className="about-kicker">Our vision <span /></p><div><i><FiEye /></i><section><h2>A Modern Customs<br />for a Stronger Ethiopia</h2><p>To be a world-class customs administration, leveraging innovation and digital technology to simplify trade, boost economic growth and create value for all stakeholders.</p></section></div></article></section>
    <section className="about-why"><div className="landing-wrap about-why-grid"><article><p className="about-kicker">Why we exist <span /></p><h2>Technology for<br />fairer and faster trade.</h2><p>We exist to make customs processes simpler, faster, and more transparent — using data, technology and people. Our platform brings together all the stakeholders in the trade ecosystem, replacing manual work, eliminating bottlenecks, and building trust in the system.</p><a href="#values" className="about-outline">Learn more about our work <FiArrowRight /></a></article><div className="about-photo"><div><b>Efficient systems.<br />Stronger borders.<br />Greater opportunities.</b></div></div></div></section>
    <section className="about-values landing-wrap" id="values"><p className="about-kicker">Our values <span /></p><h2>What drives us</h2><div className="about-values-grid">{values.map(([ItemIcon, title, description]) => <article key={title}><i><ItemIcon /></i><h3>{title}</h3><p>{description}</p></article>)}</div></section>
    <section className="about-impact"><div className="landing-wrap impact-inner"><div><p className="about-kicker">Our impact <span /></p><h2>Contributing to Ethiopia’s<br />economic growth</h2></div>{[["1000+", "Registered", "importers & exporters"], ["50+", "Customs offices", "nationwide"], ["99%", "Digital transactions", "(ongoing)"], ["24/7", "Platform availability", "for stakeholders"]].map(item => <div className="impact-stat" key={item[0]}><strong>{item[0]}</strong><span>{item[1]}<br />{item[2]}</span></div>)}</div></section>
    <section className="about-team landing-wrap"><article><p className="about-kicker">Our team <span /></p><h2>People, process and technology.</h2><p>Our team is made up of dedicated professionals — customs officers, IT experts, analysts and support staff — working together to build a modern, efficient and customer-focused customs administration.</p><a className="about-outline" href="#contact">Meet our team <FiArrowRight /></a></article><div className="team-card-grid">{teamItems.map(([TeamIcon, title, text]) => <article key={title}><i><TeamIcon /></i><h3>{title}</h3><p>{text}</p></article>)}</div></section>
    <section className="about-access" id="contact"><div className="landing-wrap"><i><FiArrowRight /></i><span><strong>Ready to experience a simpler, smarter customs process?</strong><small>Join thousands of businesses and citizens already using the platform.</small></span><Link href="/login" className="landing-primary">Go to platform <FiArrowRight /></Link></div></section>
    <footer className="landing-footer"><div className="landing-wrap footer-main"><div><Brand variant="light" /><p className="footer-portal">Customs Valuation Portal</p></div><div><h4>Navigation</h4><Link href="/">Home</Link><Link href="/about">About</Link><Link href="/contact">Contact</Link></div><div><h4>Support</h4><a href="#contact">Help</a><a href="#contact">User Guide</a><a href="#contact">FAQs</a></div><div><h4>Legal</h4><a href="#contact">Privacy Policy</a><a href="#contact">Terms of Service</a></div></div><div className="landing-wrap footer-bottom"><span>© 2026 Ethiopia Customs Commission</span><span>Secure borders. Prosperous nation.</span></div></footer>
  </main>;
}
