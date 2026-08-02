package com.minicdn.edge;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {
    @Override
    public void addCorsMappings(CorsRegistry registry) {
        // Demo project: the dashboard polls each edge's /stats directly from
        // the browser, so allow all origins. Lock this down for production.
        registry.addMapping("/**").allowedOrigins("*").allowedMethods("GET", "POST");
    }
}
