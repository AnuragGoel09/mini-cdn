package com.minicdn.origin;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {
    @Override
    public void addCorsMappings(CorsRegistry registry) {
        // Demo project: the dashboard's file dropdown fetches this directly
        // from the browser (see VITE_ORIGIN_URL), so allow all origins.
        registry.addMapping("/**").allowedOrigins("*").allowedMethods("GET", "POST");
    }
}